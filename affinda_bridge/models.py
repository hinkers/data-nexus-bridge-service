from django.db import models
from django.utils import timezone


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
