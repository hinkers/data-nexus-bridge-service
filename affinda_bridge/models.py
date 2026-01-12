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
