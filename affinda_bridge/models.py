from django.db import models
from django.utils import timezone


class SystemSettings(models.Model):
    """
    Singleton model for storing system-wide configuration settings.
    Uses a key-value pattern for flexibility.
    """

    SETTING_AFFINDA_API_KEY = "affinda_api_key"
    SETTING_AFFINDA_BASE_URL = "affinda_base_url"
    SETTING_AFFINDA_ORGANIZATION = "affinda_organization"

    key = models.CharField(max_length=64, unique=True, primary_key=True)
    value = models.TextField(blank=True)
    encrypted = models.BooleanField(
        default=False,
        help_text="Whether the value is stored encrypted (for sensitive data)",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "System Setting"
        verbose_name_plural = "System Settings"

    def __str__(self) -> str:
        return f"{self.key}"

    @classmethod
    def get_value(cls, key: str, default: str = "") -> str:
        """Get a setting value by key, returning default if not found."""
        try:
            setting = cls.objects.get(key=key)
            return setting.value
        except cls.DoesNotExist:
            return default

    @classmethod
    def set_value(cls, key: str, value: str, encrypted: bool = False) -> "SystemSettings":
        """Set a setting value, creating or updating as needed."""
        setting, _ = cls.objects.update_or_create(
            key=key,
            defaults={"value": value, "encrypted": encrypted},
        )
        return setting


class Workspace(models.Model):
    identifier = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255, blank=True)
    organization_identifier = models.CharField(max_length=64, blank=True)
    raw = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return self.name or self.identifier


class Collection(models.Model):
    identifier = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255, blank=True)
    workspace = models.ForeignKey(Workspace, on_delete=models.CASCADE)
    raw = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return self.name or self.identifier


class FieldDefinition(models.Model):
    collection = models.ForeignKey(Collection, on_delete=models.CASCADE)
    datapoint_identifier = models.CharField(max_length=64)
    name = models.CharField(max_length=255, blank=True)
    slug = models.CharField(max_length=255, blank=True)
    data_type = models.CharField(max_length=64, blank=True)
    raw = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["collection", "datapoint_identifier"],
                name="uniq_collection_datapoint",
            )
        ]

    def __str__(self) -> str:
        return self.name or self.datapoint_identifier


class DataPoint(models.Model):
    identifier = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255, blank=True)
    slug = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    annotation_content_type = models.CharField(max_length=64, blank=True)
    organization_identifier = models.CharField(max_length=64, blank=True)
    extractor = models.CharField(max_length=64, blank=True)
    is_public = models.BooleanField(default=False)
    raw = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return self.name or self.slug or self.identifier


class Document(models.Model):
    # Document states
    STATE_REVIEW = "review"
    STATE_COMPLETE = "complete"
    STATE_ARCHIVED = "archived"
    STATE_CHOICES = [
        (STATE_REVIEW, "Review"),
        (STATE_COMPLETE, "Complete"),
        (STATE_ARCHIVED, "Archived"),
    ]

    identifier = models.CharField(max_length=64, unique=True)
    custom_identifier = models.CharField(max_length=255, blank=True)
    file_name = models.CharField(max_length=512, blank=True)
    file_url = models.URLField(max_length=1024, blank=True)
    review_url = models.URLField(max_length=1024, blank=True, help_text="URL to review/edit the document in Affinda")

    workspace = models.ForeignKey(
        Workspace,
        on_delete=models.CASCADE,
        related_name="documents",
        null=True,
        blank=True,
    )
    collection = models.ForeignKey(
        Collection,
        on_delete=models.SET_NULL,
        related_name="documents",
        null=True,
        blank=True,
    )

    state = models.CharField(max_length=32, choices=STATE_CHOICES, blank=True)
    is_confirmed = models.BooleanField(default=False)
    in_review = models.BooleanField(default=False)
    failed = models.BooleanField(default=False)
    ready = models.BooleanField(default=False)
    validatable = models.BooleanField(default=False)
    has_challenges = models.BooleanField(default=False)

    created_dt = models.DateTimeField(default=timezone.now)
    uploaded_dt = models.DateTimeField(null=True, blank=True)
    last_updated_dt = models.DateTimeField(null=True, blank=True)

    # Extracted data stored as JSON
    data = models.JSONField(default=dict, blank=True)
    meta = models.JSONField(default=dict, blank=True)
    tags = models.JSONField(default=list, blank=True)

    raw = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_dt"]
        indexes = [
            models.Index(fields=["workspace", "collection"]),
            models.Index(fields=["state"]),
            models.Index(fields=["created_dt"]),
            models.Index(fields=["custom_identifier"]),
        ]

    def __str__(self) -> str:
        return self.custom_identifier or self.file_name or self.identifier


class SyncHistory(models.Model):
    SYNC_TYPE_WORKSPACES = "workspaces"
    SYNC_TYPE_COLLECTIONS = "collections"
    SYNC_TYPE_FIELD_DEFINITIONS = "field_definitions"
    SYNC_TYPE_DOCUMENTS = "documents"
    SYNC_TYPE_CHOICES = [
        (SYNC_TYPE_WORKSPACES, "Workspaces"),
        (SYNC_TYPE_COLLECTIONS, "Collections"),
        (SYNC_TYPE_FIELD_DEFINITIONS, "Field Definitions"),
        (SYNC_TYPE_DOCUMENTS, "Documents"),
    ]

    sync_type = models.CharField(max_length=32, choices=SYNC_TYPE_CHOICES)
    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    success = models.BooleanField(default=False)
    records_synced = models.IntegerField(default=0)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["sync_type", "-started_at"]),
        ]

    def __str__(self) -> str:
        status = "Success" if self.success else "Failed"
        return f"{self.get_sync_type_display()} - {status} at {self.started_at}"


class DocumentFieldValue(models.Model):
    """
    Normalized storage of document field values.
    Extracts values from Document.data JSON into individual rows for SQL view creation.
    """

    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="field_values",
    )
    field_definition = models.ForeignKey(
        FieldDefinition,
        on_delete=models.CASCADE,
        related_name="document_values",
    )
    value = models.TextField(blank=True, null=True)
    raw_value = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["document", "field_definition"],
                name="unique_document_field_value",
            )
        ]
        indexes = [
            models.Index(fields=["document", "field_definition"]),
            models.Index(fields=["field_definition"]),
        ]

    def __str__(self) -> str:
        val_preview = self.value[:50] if self.value else "N/A"
        return f"{self.document} - {self.field_definition.name}: {val_preview}"


class CollectionView(models.Model):
    """
    Represents a SQL VIEW created for a collection.
    Tracks view definitions and their current state in the database.
    """

    # Available document columns that can be included in the view
    DOCUMENT_COLUMNS = [
        ("identifier", "Identifier"),
        ("custom_identifier", "Custom Identifier"),
        ("file_name", "File Name"),
        ("file_url", "File URL"),
        ("review_url", "Review URL"),
        ("state", "State"),
        ("is_confirmed", "Is Confirmed"),
        ("in_review", "In Review"),
        ("failed", "Failed"),
        ("ready", "Ready"),
        ("validatable", "Validatable"),
        ("has_challenges", "Has Challenges"),
        ("created_dt", "Created Date"),
        ("uploaded_dt", "Uploaded Date"),
        ("last_updated_dt", "Last Updated Date"),
    ]
    DEFAULT_DOCUMENT_COLUMNS = [
        "identifier",
        "custom_identifier",
        "file_name",
        "review_url",
        "state",
        "created_dt",
    ]

    collection = models.ForeignKey(
        Collection,
        on_delete=models.CASCADE,
        related_name="sql_views",
    )
    name = models.CharField(
        max_length=255,
        help_text="User-friendly name for the view",
    )
    sql_view_name = models.CharField(
        max_length=128,
        unique=True,
        blank=True,
        help_text="Actual SQL view name (auto-generated, sanitized)",
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(
        default=False,
        help_text="Whether the view currently exists in the database",
    )
    include_fields = models.JSONField(
        default=list,
        blank=True,
        help_text="List of field_definition IDs to include (empty = all)",
    )
    include_document_columns = models.JSONField(
        default=list,
        blank=True,
        help_text="List of document column names to include (empty = defaults)",
    )
    include_external_tables = models.JSONField(
        default=list,
        blank=True,
        help_text="List of ExternalTable IDs to include in the view",
    )
    last_sql = models.TextField(
        blank=True,
        help_text="Last SQL statement used to create the view",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    last_refreshed_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When the view was last refreshed in the database",
    )
    error_message = models.TextField(
        blank=True,
        help_text="Last error message if view creation failed",
    )

    class Meta:
        ordering = ["collection", "name"]
        indexes = [
            models.Index(fields=["collection", "is_active"]),
            models.Index(fields=["sql_view_name"]),
        ]

    def __str__(self) -> str:
        status = "Active" if self.is_active else "Inactive"
        return f"{self.name} ({self.sql_view_name}) - {status}"

    def save(self, *args, **kwargs):
        if not self.sql_view_name:
            self.sql_view_name = self.generate_safe_view_name()
        super().save(*args, **kwargs)

    def generate_safe_view_name(self) -> str:
        """Generate a SQL-safe view name from the collection and view name."""
        import re

        # Start with collection identifier and view name
        base = f"view_{self.collection.identifier}_{self.name}"
        # Remove or replace unsafe characters
        safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", base)
        # Ensure it doesn't start with a number
        if safe_name[0].isdigit():
            safe_name = f"v_{safe_name}"
        # Truncate to 128 chars (safe for all databases)
        return safe_name[:128].lower()


class ExternalTable(models.Model):
    """
    Represents a custom external table definition for a collection.
    The actual database table is created/managed separately from the Django ORM.
    Users can define columns and the app creates the table with a document_identifier
    column for linking to documents.
    """

    collection = models.ForeignKey(
        Collection,
        on_delete=models.CASCADE,
        related_name="external_tables",
    )
    name = models.CharField(
        max_length=255,
        help_text="User-friendly name for the external table",
    )
    sql_table_name = models.CharField(
        max_length=128,
        unique=True,
        blank=True,
        help_text="Actual SQL table name (auto-generated, sanitized)",
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(
        default=False,
        help_text="Whether the table currently exists in the database",
    )
    last_sql = models.TextField(
        blank=True,
        help_text="Last SQL statement used to create the table",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)
    error_message = models.TextField(
        blank=True,
        help_text="Last error message if table creation failed",
    )

    class Meta:
        ordering = ["collection", "name"]
        indexes = [
            models.Index(fields=["collection", "is_active"]),
            models.Index(fields=["sql_table_name"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["collection", "name"],
                name="unique_collection_external_table_name",
            )
        ]

    def __str__(self) -> str:
        status = "Active" if self.is_active else "Inactive"
        return f"{self.name} ({self.sql_table_name}) - {status}"

    def save(self, *args, **kwargs):
        if not self.sql_table_name:
            self.sql_table_name = self.generate_safe_table_name()
        super().save(*args, **kwargs)

    def generate_safe_table_name(self) -> str:
        """Generate a SQL-safe table name from collection and table name."""
        import re

        base = f"ext_{self.collection.identifier}_{self.name}"
        safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", base)
        if safe_name[0].isdigit():
            safe_name = f"t_{safe_name}"
        return safe_name[:128].lower()


class ExternalTableColumn(models.Model):
    """
    Represents a column definition within an external table.
    """

    # Supported column types
    TYPE_TEXT = "text"
    TYPE_INTEGER = "integer"
    TYPE_DECIMAL = "decimal"
    TYPE_BOOLEAN = "boolean"
    TYPE_DATE = "date"
    TYPE_DATETIME = "datetime"
    TYPE_CHOICES = [
        (TYPE_TEXT, "Text"),
        (TYPE_INTEGER, "Integer"),
        (TYPE_DECIMAL, "Decimal"),
        (TYPE_BOOLEAN, "Boolean"),
        (TYPE_DATE, "Date"),
        (TYPE_DATETIME, "DateTime"),
    ]

    external_table = models.ForeignKey(
        ExternalTable,
        on_delete=models.CASCADE,
        related_name="columns",
    )
    name = models.CharField(
        max_length=255,
        help_text="User-friendly column name",
    )
    sql_column_name = models.CharField(
        max_length=63,
        blank=True,
        help_text="Actual SQL column name (auto-generated, sanitized)",
    )
    data_type = models.CharField(
        max_length=32,
        choices=TYPE_CHOICES,
        default=TYPE_TEXT,
    )
    is_nullable = models.BooleanField(
        default=True,
        help_text="Whether the column allows NULL values",
    )
    display_order = models.PositiveIntegerField(
        default=0,
        help_text="Order in which columns are displayed",
    )

    class Meta:
        ordering = ["external_table", "display_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["external_table", "name"],
                name="unique_external_table_column_name",
            )
        ]

    def __str__(self) -> str:
        return f"{self.external_table.name}.{self.name} ({self.data_type})"

    def save(self, *args, **kwargs):
        if not self.sql_column_name:
            self.sql_column_name = self.generate_safe_column_name()
        super().save(*args, **kwargs)

    def generate_safe_column_name(self) -> str:
        """Generate a SQL-safe column name."""
        import re

        safe_name = re.sub(r"[^a-zA-Z0-9_]", "_", self.name)
        if safe_name[0].isdigit():
            safe_name = f"c_{safe_name}"
        return safe_name[:63].lower()
