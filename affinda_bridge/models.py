import secrets

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
    sync_enabled = models.BooleanField(
        default=True,
        help_text="Whether this document should be included in selective/scheduled syncs",
    )

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
    SYNC_TYPE_FULL_COLLECTION = "full_collection"
    SYNC_TYPE_SELECTIVE = "selective"
    SYNC_TYPE_WEBHOOK = "webhook"
    SYNC_TYPE_SCHEDULED = "scheduled"
    SYNC_TYPE_DATA_SOURCE = "data_source"
    SYNC_TYPE_CHOICES = [
        (SYNC_TYPE_WORKSPACES, "Workspaces"),
        (SYNC_TYPE_COLLECTIONS, "Collections"),
        (SYNC_TYPE_FIELD_DEFINITIONS, "Field Definitions"),
        (SYNC_TYPE_DOCUMENTS, "Documents"),
        (SYNC_TYPE_FULL_COLLECTION, "Full Collection Sync"),
        (SYNC_TYPE_SELECTIVE, "Selective Sync"),
        (SYNC_TYPE_WEBHOOK, "Webhook Sync"),
        (SYNC_TYPE_SCHEDULED, "Scheduled Sync"),
        (SYNC_TYPE_DATA_SOURCE, "Data Source Sync"),
    ]

    STATUS_PENDING = "pending"
    STATUS_IN_PROGRESS = "in_progress"
    STATUS_COMPLETED = "completed"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_IN_PROGRESS, "In Progress"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_FAILED, "Failed"),
    ]

    sync_type = models.CharField(max_length=32, choices=SYNC_TYPE_CHOICES)
    status = models.CharField(
        max_length=32,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    collection = models.ForeignKey(
        "Collection",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sync_histories",
        help_text="Collection being synced (for collection-specific syncs)",
    )
    plugin_instance = models.ForeignKey(
        "plugins.PluginInstance",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sync_histories",
        help_text="Plugin instance being executed (for data source syncs)",
    )
    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    success = models.BooleanField(default=False)
    records_synced = models.IntegerField(default=0)
    error_message = models.TextField(blank=True)

    # Progress tracking for large syncs
    total_documents = models.IntegerField(default=0)
    documents_created = models.IntegerField(default=0)
    documents_updated = models.IntegerField(default=0)
    documents_failed = models.IntegerField(default=0)
    progress_percent = models.IntegerField(default=0)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["sync_type", "-started_at"]),
            models.Index(fields=["status"]),
            models.Index(fields=["collection", "-started_at"]),
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
    default_value = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        help_text="Default value for the column (stored as string, converted to appropriate type)",
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


class WebhookConfiguration(models.Model):
    """
    Singleton model for webhook configuration.
    Stores webhook settings including the secret token for URL-based authentication.
    """

    # Supported webhook events
    EVENT_DOCUMENT_PARSE_SUCCEEDED = "document.parse.succeeded"
    EVENT_DOCUMENT_PARSE_FAILED = "document.parse.failed"
    EVENT_DOCUMENT_PARSE_COMPLETED = "document.parse.completed"
    EVENT_DOCUMENT_VALIDATE_COMPLETED = "document.validate.completed"
    EVENT_DOCUMENT_CLASSIFY_SUCCEEDED = "document.classify.succeeded"
    EVENT_DOCUMENT_CLASSIFY_FAILED = "document.classify.failed"
    EVENT_DOCUMENT_CLASSIFY_COMPLETED = "document.classify.completed"
    EVENT_DOCUMENT_REJECTED = "document.rejected"

    SUPPORTED_EVENTS = [
        (EVENT_DOCUMENT_PARSE_SUCCEEDED, "Document Parse Succeeded"),
        (EVENT_DOCUMENT_PARSE_FAILED, "Document Parse Failed"),
        (EVENT_DOCUMENT_PARSE_COMPLETED, "Document Parse Completed"),
        (EVENT_DOCUMENT_VALIDATE_COMPLETED, "Document Validate Completed"),
        (EVENT_DOCUMENT_CLASSIFY_SUCCEEDED, "Document Classify Succeeded"),
        (EVENT_DOCUMENT_CLASSIFY_FAILED, "Document Classify Failed"),
        (EVENT_DOCUMENT_CLASSIFY_COMPLETED, "Document Classify Completed"),
        (EVENT_DOCUMENT_REJECTED, "Document Rejected"),
    ]

    enabled = models.BooleanField(
        default=False,
        help_text="Master toggle for webhook processing",
    )
    secret_token = models.CharField(
        max_length=64,
        unique=True,
        help_text="Secret token used in webhook URL for authentication",
    )
    enabled_events = models.JSONField(
        default=list,
        blank=True,
        help_text="List of enabled event types",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Webhook Configuration"
        verbose_name_plural = "Webhook Configuration"

    def __str__(self) -> str:
        status = "Enabled" if self.enabled else "Disabled"
        return f"Webhook Configuration ({status})"

    def save(self, *args, **kwargs):
        if not self.secret_token:
            self.secret_token = self.generate_secret_token()
        # Ensure only one instance exists
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get_config(cls) -> "WebhookConfiguration":
        """Get or create the singleton webhook configuration."""
        config, _ = cls.objects.get_or_create(
            pk=1,
            defaults={"secret_token": cls.generate_secret_token()},
        )
        return config

    @staticmethod
    def generate_secret_token() -> str:
        """Generate a cryptographically secure token."""
        return secrets.token_urlsafe(32)

    def is_event_enabled(self, event_type: str) -> bool:
        """Check if a specific event type is enabled."""
        return self.enabled and event_type in self.enabled_events


class WebhookLog(models.Model):
    """
    Audit log for received webhooks.
    Tracks all incoming webhook requests for debugging and monitoring.
    """

    STATUS_RECEIVED = "received"
    STATUS_PROCESSED = "processed"
    STATUS_FAILED = "failed"
    STATUS_IGNORED = "ignored"
    STATUS_CHOICES = [
        (STATUS_RECEIVED, "Received"),
        (STATUS_PROCESSED, "Processed"),
        (STATUS_FAILED, "Failed"),
        (STATUS_IGNORED, "Ignored"),
    ]

    event_type = models.CharField(max_length=64)
    document_identifier = models.CharField(max_length=64, blank=True)
    payload = models.JSONField(default=dict)
    status = models.CharField(
        max_length=32,
        choices=STATUS_CHOICES,
        default=STATUS_RECEIVED,
    )
    error_message = models.TextField(blank=True)
    received_at = models.DateTimeField(default=timezone.now)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-received_at"]
        indexes = [
            models.Index(fields=["-received_at"]),
            models.Index(fields=["status"]),
            models.Index(fields=["event_type"]),
            models.Index(fields=["document_identifier"]),
        ]

    def __str__(self) -> str:
        return f"{self.event_type} - {self.status} at {self.received_at}"


class SyncSchedule(models.Model):
    """
    Configurable sync schedules for automated document synchronization.
    Supports cron-based scheduling for both full collection and selective syncs.
    """

    SYNC_TYPE_FULL_COLLECTION = "full_collection"
    SYNC_TYPE_SELECTIVE = "selective"
    SYNC_TYPE_DATA_SOURCE = "data_source"
    SYNC_TYPE_CHOICES = [
        (SYNC_TYPE_FULL_COLLECTION, "Full Collection Sync"),
        (SYNC_TYPE_SELECTIVE, "Selective Sync"),
        (SYNC_TYPE_DATA_SOURCE, "Data Source Sync"),
    ]

    name = models.CharField(
        max_length=255,
        help_text="User-friendly name for this schedule",
    )
    sync_type = models.CharField(
        max_length=32,
        choices=SYNC_TYPE_CHOICES,
        help_text="Type of sync to perform",
    )
    collection = models.ForeignKey(
        Collection,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="sync_schedules",
        help_text="Collection to sync (required for full_collection, optional for selective)",
    )
    plugin_instance = models.ForeignKey(
        "plugins.PluginInstance",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="sync_schedules",
        help_text="Plugin instance to run (required for data_source sync type)",
    )
    enabled = models.BooleanField(
        default=True,
        help_text="Whether this schedule is active",
    )
    cron_expression = models.CharField(
        max_length=100,
        help_text="Cron expression for scheduling (e.g., '0 2 * * *' for 2am daily)",
    )
    last_run_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When this schedule was last executed",
    )
    next_run_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Calculated next run time",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["enabled", "next_run_at"]),
            models.Index(fields=["collection"]),
            models.Index(fields=["plugin_instance"]),
        ]

    def __str__(self) -> str:
        status = "Enabled" if self.enabled else "Disabled"
        return f"{self.name} ({self.get_sync_type_display()}) - {status}"

    def calculate_next_run(self, from_time=None):
        """Calculate and set the next run time based on cron expression."""
        try:
            from croniter import croniter

            base_time = from_time or timezone.now()
            cron = croniter(self.cron_expression, base_time)
            self.next_run_at = cron.get_next(timezone.datetime)
            return self.next_run_at
        except Exception:
            return None

    def should_run_now(self) -> bool:
        """Check if this schedule should execute now."""
        if not self.enabled:
            return False
        if not self.next_run_at:
            return False
        return timezone.now() >= self.next_run_at

    def save(self, *args, **kwargs):
        # Calculate next run time on save if not set
        if self.enabled and not self.next_run_at:
            self.calculate_next_run()
        super().save(*args, **kwargs)


class SyncScheduleRun(models.Model):
    """
    Tracks individual executions of sync schedules.
    Links schedules to their sync history records for auditing.
    """

    TRIGGERED_BY_SCHEDULED = "scheduled"
    TRIGGERED_BY_MANUAL = "manual"
    TRIGGERED_BY_CHOICES = [
        (TRIGGERED_BY_SCHEDULED, "Scheduled"),
        (TRIGGERED_BY_MANUAL, "Manual"),
    ]

    schedule = models.ForeignKey(
        SyncSchedule,
        on_delete=models.CASCADE,
        related_name="runs",
    )
    sync_history = models.ForeignKey(
        SyncHistory,
        on_delete=models.CASCADE,
        related_name="schedule_runs",
    )
    triggered_by = models.CharField(
        max_length=32,
        choices=TRIGGERED_BY_CHOICES,
        default=TRIGGERED_BY_SCHEDULED,
    )
    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["schedule", "-started_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.schedule.name} - {self.triggered_by} at {self.started_at}"


class SyncLogEntry(models.Model):
    """
    Detailed log entries for sync operations.
    Captures document-level errors, warnings, and info for debugging sync failures.
    """

    LEVEL_DEBUG = "debug"
    LEVEL_INFO = "info"
    LEVEL_WARNING = "warning"
    LEVEL_ERROR = "error"
    LEVEL_CHOICES = [
        (LEVEL_DEBUG, "Debug"),
        (LEVEL_INFO, "Info"),
        (LEVEL_WARNING, "Warning"),
        (LEVEL_ERROR, "Error"),
    ]

    sync_history = models.ForeignKey(
        SyncHistory,
        on_delete=models.CASCADE,
        related_name="log_entries",
    )
    level = models.CharField(
        max_length=16,
        choices=LEVEL_CHOICES,
        default=LEVEL_INFO,
    )
    message = models.TextField()
    document_identifier = models.CharField(
        max_length=64,
        blank=True,
        help_text="Document identifier if this log entry relates to a specific document",
    )
    details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Additional structured data (exception details, API response, etc.)",
    )
    timestamp = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["timestamp"]
        indexes = [
            models.Index(fields=["sync_history", "timestamp"]),
            models.Index(fields=["sync_history", "level"]),
            models.Index(fields=["document_identifier"]),
        ]

    def __str__(self) -> str:
        doc_info = f" [{self.document_identifier}]" if self.document_identifier else ""
        return f"[{self.level.upper()}]{doc_info} {self.message[:100]}"

    @classmethod
    def log(cls, sync_history, level: str, message: str, document_identifier: str = "", details: dict | None = None):
        """Helper method to create a log entry."""
        return cls.objects.create(
            sync_history=sync_history,
            level=level,
            message=message,
            document_identifier=document_identifier,
            details=details or {},
        )

    @classmethod
    def debug(cls, sync_history, message: str, document_identifier: str = "", details: dict | None = None):
        return cls.log(sync_history, cls.LEVEL_DEBUG, message, document_identifier, details)

    @classmethod
    def info(cls, sync_history, message: str, document_identifier: str = "", details: dict | None = None):
        return cls.log(sync_history, cls.LEVEL_INFO, message, document_identifier, details)

    @classmethod
    def warning(cls, sync_history, message: str, document_identifier: str = "", details: dict | None = None):
        return cls.log(sync_history, cls.LEVEL_WARNING, message, document_identifier, details)

    @classmethod
    def error(cls, sync_history, message: str, document_identifier: str = "", details: dict | None = None):
        return cls.log(sync_history, cls.LEVEL_ERROR, message, document_identifier, details)
