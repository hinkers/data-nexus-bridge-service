"""
Service for building and managing external tables for collections.
Handles multi-database compatibility (SQLite, PostgreSQL, SQL Server).
"""

import logging
from typing import TYPE_CHECKING

from django.conf import settings
from django.db import connection
from django.utils import timezone

if TYPE_CHECKING:
    from affinda_bridge.models import ExternalTable, ExternalTableColumn

logger = logging.getLogger(__name__)


class ExternalTableBuilder:
    """
    Builds actual database tables for external data storage.

    Tables include:
    - document_identifier column (for linking to documents)
    - User-defined columns with appropriate types
    - Primary key on document_identifier
    """

    # Database-specific type mappings
    TYPE_MAPPINGS = {
        "sqlite": {
            "text": "TEXT",
            "integer": "INTEGER",
            "decimal": "REAL",
            "boolean": "INTEGER",  # SQLite has no native boolean
            "date": "TEXT",  # SQLite stores dates as text
            "datetime": "TEXT",
        },
        "postgresql": {
            "text": "TEXT",
            "integer": "BIGINT",
            "decimal": "DECIMAL(18,6)",
            "boolean": "BOOLEAN",
            "date": "DATE",
            "datetime": "TIMESTAMP",
        },
        "mssql": {
            "text": "NVARCHAR(MAX)",
            "integer": "BIGINT",
            "decimal": "DECIMAL(18,6)",
            "boolean": "BIT",
            "date": "DATE",
            "datetime": "DATETIME2",
        },
    }

    def __init__(self, external_table: "ExternalTable"):
        self.external_table = external_table
        self.collection = external_table.collection
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

    def _quote_identifier(self, name: str) -> str:
        """Quote an identifier based on database type."""
        if self.db_engine == "mssql":
            return f"[{name}]"
        else:  # postgresql and sqlite
            return f'"{name}"'

    def _get_sql_type(self, data_type: str) -> str:
        """Get the SQL type for a given logical data type."""
        type_map = self.TYPE_MAPPINGS.get(self.db_engine, {})
        return type_map.get(data_type, "TEXT")

    def _format_default_value(self, value: str, data_type: str) -> str:
        """Format a default value for SQL based on the column's data type."""
        if value is None:
            return "NULL"

        # Text types need quoting
        if data_type == "text":
            # Escape single quotes by doubling them
            escaped = value.replace("'", "''")
            return f"'{escaped}'"

        # Boolean conversion
        if data_type == "boolean":
            lower_val = value.lower().strip()
            if lower_val in ("true", "1", "yes"):
                if self.db_engine == "sqlite":
                    return "1"
                elif self.db_engine == "mssql":
                    return "1"
                else:
                    return "TRUE"
            else:
                if self.db_engine == "sqlite":
                    return "0"
                elif self.db_engine == "mssql":
                    return "0"
                else:
                    return "FALSE"

        # Date/datetime types need quoting
        if data_type in ("date", "datetime"):
            escaped = value.replace("'", "''")
            return f"'{escaped}'"

        # Numeric types (integer, decimal) - return as-is
        return value

    def get_columns(self) -> list["ExternalTableColumn"]:
        """Get all columns for this external table."""
        return list(self.external_table.columns.order_by("display_order", "name"))

    def _build_column_def(self, column: "ExternalTableColumn") -> str:
        """Build a single column definition for CREATE TABLE."""
        col_name = self._quote_identifier(column.sql_column_name)
        sql_type = self._get_sql_type(column.data_type)
        nullable = "NULL" if column.is_nullable else "NOT NULL"

        col_def = f"{col_name} {sql_type}"

        # Add DEFAULT clause if specified
        if column.default_value is not None and column.default_value != "":
            default_sql = self._format_default_value(column.default_value, column.data_type)
            col_def += f" DEFAULT {default_sql}"

        col_def += f" {nullable}"
        return col_def

    def build_create_sql(self) -> str:
        """Build the CREATE TABLE SQL statement."""
        table_name = self._quote_identifier(self.external_table.sql_table_name)
        columns = self.get_columns()

        # Start with document_identifier column (primary key)
        column_defs = [
            f"{self._quote_identifier('document_identifier')} VARCHAR(64) NOT NULL PRIMARY KEY"
        ]

        # Add user-defined columns
        for col in columns:
            column_defs.append(self._build_column_def(col))

        columns_sql = ",\n    ".join(column_defs)

        return f"""CREATE TABLE {table_name} (
    {columns_sql}
)"""

    def build_drop_sql(self) -> str:
        """Build the DROP TABLE SQL statement."""
        table_name = self._quote_identifier(self.external_table.sql_table_name)
        return f"DROP TABLE IF EXISTS {table_name}"

    def create_table(self) -> tuple[bool, str]:
        """Create the external table in the database."""
        try:
            with connection.cursor() as cursor:
                create_sql = self.build_create_sql()
                cursor.execute(create_sql)

                self.external_table.is_active = True
                self.external_table.last_sql = create_sql
                self.external_table.error_message = ""
                self.external_table.save()

                logger.info(
                    f"Created external table: {self.external_table.sql_table_name}"
                )
                return True, "Table created successfully"

        except Exception as e:
            error_msg = str(e)
            self.external_table.is_active = False
            self.external_table.error_message = error_msg
            self.external_table.save()
            logger.error(
                f"Failed to create table {self.external_table.sql_table_name}: {error_msg}"
            )
            return False, error_msg

    def drop_table(self) -> tuple[bool, str]:
        """Drop the external table from the database."""
        try:
            with connection.cursor() as cursor:
                drop_sql = self.build_drop_sql()
                cursor.execute(drop_sql)

                self.external_table.is_active = False
                self.external_table.error_message = ""
                self.external_table.save()

                logger.info(
                    f"Dropped external table: {self.external_table.sql_table_name}"
                )
                return True, "Table dropped successfully"

        except Exception as e:
            error_msg = str(e)
            self.external_table.error_message = error_msg
            self.external_table.save()
            logger.error(
                f"Failed to drop table {self.external_table.sql_table_name}: {error_msg}"
            )
            return False, error_msg

    def rebuild_table(self) -> tuple[bool, str]:
        """Rebuild the table (drop and recreate with current schema)."""
        success, msg = self.drop_table()
        if not success and "does not exist" not in msg.lower():
            return False, f"Failed to drop table: {msg}"

        return self.create_table()

    def build_add_column_sql(self, column: "ExternalTableColumn") -> str:
        """Build the ALTER TABLE ADD COLUMN SQL statement."""
        table_name = self._quote_identifier(self.external_table.sql_table_name)
        col_def = self._build_column_def(column)

        return f"ALTER TABLE {table_name} ADD {col_def}"

    def build_drop_column_sql(self, column: "ExternalTableColumn") -> str:
        """Build the ALTER TABLE DROP COLUMN SQL statement."""
        table_name = self._quote_identifier(self.external_table.sql_table_name)
        col_name = self._quote_identifier(column.sql_column_name)

        return f"ALTER TABLE {table_name} DROP COLUMN {col_name}"

    def add_column(self, column: "ExternalTableColumn") -> tuple[bool, str]:
        """Add a column to an active external table."""
        if not self.external_table.is_active:
            return False, "Table is not active"

        try:
            with connection.cursor() as cursor:
                add_sql = self.build_add_column_sql(column)
                cursor.execute(add_sql)

                # Update the last_sql to reflect current schema
                self.external_table.last_sql = self.build_create_sql()
                self.external_table.save()

                logger.info(
                    f"Added column {column.sql_column_name} to table "
                    f"{self.external_table.sql_table_name}"
                )
                return True, "Column added successfully"

        except Exception as e:
            error_msg = str(e)
            logger.error(
                f"Failed to add column {column.sql_column_name} to table "
                f"{self.external_table.sql_table_name}: {error_msg}"
            )
            return False, error_msg

    def drop_column(self, column: "ExternalTableColumn") -> tuple[bool, str]:
        """Drop a column from an active external table."""
        if not self.external_table.is_active:
            return False, "Table is not active"

        # SQLite does not support DROP COLUMN before version 3.35.0
        if self.db_engine == "sqlite":
            return False, "SQLite does not support dropping columns. Please rebuild the table instead."

        try:
            with connection.cursor() as cursor:
                drop_sql = self.build_drop_column_sql(column)
                cursor.execute(drop_sql)

                # Update the last_sql to reflect current schema
                self.external_table.last_sql = self.build_create_sql()
                self.external_table.save()

                logger.info(
                    f"Dropped column {column.sql_column_name} from table "
                    f"{self.external_table.sql_table_name}"
                )
                return True, "Column dropped successfully"

        except Exception as e:
            error_msg = str(e)
            logger.error(
                f"Failed to drop column {column.sql_column_name} from table "
                f"{self.external_table.sql_table_name}: {error_msg}"
            )
            return False, error_msg
