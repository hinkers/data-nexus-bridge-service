"""
Service for building and managing SQL views for collections.
Handles multi-database compatibility (SQLite, PostgreSQL, SQL Server).
"""

import logging
import re
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import connection
from django.utils import timezone

if TYPE_CHECKING:
    from affinda_bridge.models import CollectionView, ExternalTable, FieldDefinition

logger = logging.getLogger(__name__)


class SQLViewBuilder:
    """
    Builds SQL views that pivot DocumentFieldValue data.

    Output format:
    identifier | custom_identifier | field_name1 | field_name2 | ...
    doc123     | INV-001           | value1      | value2      | ...
    """

    def __init__(self, collection_view: "CollectionView"):
        self.collection_view = collection_view
        self.collection = collection_view.collection
        self.db_engine = self._detect_db_engine()

    def _detect_db_engine(self) -> str:
        """Detect which database engine is in use."""
        engine = settings.DATABASES["default"]["ENGINE"]
        if "sqlite" in engine:
            return "sqlite"
        elif "postgresql" in engine or "psycopg" in engine:
            return "postgresql"
        elif "mssql" in engine:
            return "mssql"
        else:
            raise ValueError(f"Unsupported database engine: {engine}")

    def _sanitize_column_name(self, name: str) -> str:
        """Sanitize a field name for use as a column name."""
        # Remove or replace unsafe characters
        safe = re.sub(r"[^a-zA-Z0-9_]", "_", name)
        # Ensure doesn't start with number
        if safe and safe[0].isdigit():
            safe = f"f_{safe}"
        # Truncate to safe length
        return safe[:63].lower()

    def _quote_identifier(self, name: str) -> str:
        """Quote an identifier based on database type."""
        if self.db_engine == "mssql":
            return f"[{name}]"
        else:  # postgresql and sqlite
            return f'"{name}"'

    def get_fields(self) -> list["FieldDefinition"]:
        """Get the field definitions to include in the view."""
        from affinda_bridge.models import FieldDefinition

        if self.collection_view.include_fields:
            return list(
                FieldDefinition.objects.filter(
                    id__in=self.collection_view.include_fields,
                    collection=self.collection,
                ).order_by("name")
            )
        return list(
            FieldDefinition.objects.filter(collection=self.collection).order_by("name")
        )

    def get_document_columns(self) -> list[str]:
        """Get the document columns to include in the view."""
        from affinda_bridge.models import CollectionView

        if self.collection_view.include_document_columns:
            # Filter to only valid column names
            valid_columns = {col[0] for col in CollectionView.DOCUMENT_COLUMNS}
            return [
                col
                for col in self.collection_view.include_document_columns
                if col in valid_columns
            ]
        return CollectionView.DEFAULT_DOCUMENT_COLUMNS

    def get_external_tables(self) -> list["ExternalTable"]:
        """Get the external tables to include in the view."""
        from affinda_bridge.models import ExternalTable

        if self.collection_view.include_external_tables:
            return list(
                ExternalTable.objects.filter(
                    id__in=self.collection_view.include_external_tables,
                    collection=self.collection,
                    is_active=True,  # Only include active tables
                ).prefetch_related("columns")
            )
        return []

    def build_create_sql(self) -> str:
        """Build the CREATE VIEW SQL statement."""
        view_name = self._quote_identifier(self.collection_view.sql_view_name)
        fields = self.get_fields()
        document_columns = self.get_document_columns()
        external_tables = self.get_external_tables()

        # Build field columns using CASE WHEN for pivot
        field_columns = []
        for field in fields:
            col_name = self._sanitize_column_name(
                field.slug or field.name or field.datapoint_identifier
            )
            quoted_col = self._quote_identifier(col_name)
            field_columns.append(
                f"MAX(CASE WHEN dfv.field_definition_id = {field.pk} "
                f"THEN dfv.value END) AS {quoted_col}"
            )

        # Build external table columns
        external_columns = []
        external_group_by = []
        # Get the column selection mapping (table_id -> list of column_ids)
        column_selection = self.collection_view.include_external_table_columns or {}

        for idx, ext_table in enumerate(external_tables):
            alias = f"ext{idx}"
            # Create a prefix from the table name for uniqueness
            table_prefix = self._sanitize_column_name(ext_table.name)

            # Get selected columns for this table (empty list or missing = all columns)
            table_id_str = str(ext_table.id)
            selected_column_ids = column_selection.get(table_id_str, [])

            for column in ext_table.columns.all():
                # Skip if specific columns are selected and this one isn't in the list
                if selected_column_ids and column.id not in selected_column_ids:
                    continue

                col_alias = f"{table_prefix}_{column.sql_column_name}"
                quoted_col_alias = self._quote_identifier(col_alias)
                external_columns.append(
                    f"{alias}.{self._quote_identifier(column.sql_column_name)} AS {quoted_col_alias}"
                )
                external_group_by.append(
                    f"{alias}.{self._quote_identifier(column.sql_column_name)}"
                )

        # Build the SELECT clause with selected document columns
        columns = (
            [f"d.{col}" for col in document_columns]
            + field_columns
            + external_columns
        )

        columns_sql = ",\n    ".join(columns)

        # Build GROUP BY clause with document columns and external table columns
        group_by_columns = (
            ["d.id"]
            + [f"d.{col}" for col in document_columns]
            + external_group_by
        )
        group_by_sql = ", ".join(group_by_columns)

        # Build JOIN clauses for external tables
        external_joins = []
        for idx, ext_table in enumerate(external_tables):
            alias = f"ext{idx}"
            table_name = self._quote_identifier(ext_table.sql_table_name)
            external_joins.append(
                f"LEFT JOIN {table_name} {alias} ON {alias}.document_identifier = d.identifier"
            )
        external_joins_sql = "\n".join(external_joins)

        # Base query with joins
        base_query = f"""
SELECT
    {columns_sql}
FROM affinda_bridge_document d
LEFT JOIN affinda_bridge_documentfieldvalue dfv ON dfv.document_id = d.id
{external_joins_sql}
WHERE d.collection_id = {self.collection.pk}
GROUP BY {group_by_sql}
"""

        # Database-specific CREATE VIEW syntax
        if self.db_engine == "postgresql":
            return f"CREATE OR REPLACE VIEW {view_name} AS {base_query}"
        elif self.db_engine == "mssql":
            return f"CREATE OR ALTER VIEW {view_name} AS {base_query}"
        else:  # sqlite
            # SQLite doesn't support CREATE OR REPLACE, so we drop first
            return f"CREATE VIEW {view_name} AS {base_query}"

    def build_drop_sql(self) -> str:
        """Build the DROP VIEW SQL statement."""
        view_name = self._quote_identifier(self.collection_view.sql_view_name)
        return f"DROP VIEW IF EXISTS {view_name}"

    def create_view(self) -> tuple[bool, str]:
        """Create the SQL view in the database."""
        try:
            with connection.cursor() as cursor:
                # For SQLite, drop first since no CREATE OR REPLACE
                if self.db_engine == "sqlite":
                    drop_sql = self.build_drop_sql()
                    cursor.execute(drop_sql)

                create_sql = self.build_create_sql()
                cursor.execute(create_sql)

                # Update the model
                self.collection_view.is_active = True
                self.collection_view.last_sql = create_sql
                self.collection_view.last_refreshed_at = timezone.now()
                self.collection_view.error_message = ""
                self.collection_view.save()

                logger.info(f"Created SQL view: {self.collection_view.sql_view_name}")
                return True, "View created successfully"

        except Exception as e:
            error_msg = str(e)
            self.collection_view.is_active = False
            self.collection_view.error_message = error_msg
            self.collection_view.save()
            logger.error(
                f"Failed to create view {self.collection_view.sql_view_name}: {error_msg}"
            )
            return False, error_msg

    def drop_view(self) -> tuple[bool, str]:
        """Drop the SQL view from the database."""
        try:
            with connection.cursor() as cursor:
                drop_sql = self.build_drop_sql()
                cursor.execute(drop_sql)

                self.collection_view.is_active = False
                self.collection_view.error_message = ""
                self.collection_view.save()

                logger.info(f"Dropped SQL view: {self.collection_view.sql_view_name}")
                return True, "View dropped successfully"

        except Exception as e:
            error_msg = str(e)
            self.collection_view.error_message = error_msg
            self.collection_view.save()
            logger.error(
                f"Failed to drop view {self.collection_view.sql_view_name}: {error_msg}"
            )
            return False, error_msg

    def refresh_view(self) -> tuple[bool, str]:
        """Refresh the view (drop and recreate with current schema)."""
        success, msg = self.drop_view()
        if not success and "does not exist" not in msg.lower():
            return False, f"Failed to drop view: {msg}"

        return self.create_view()
