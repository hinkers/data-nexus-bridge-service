from rest_framework import serializers

from affinda_bridge.models import (
    Collection,
    CollectionView,
    DataPoint,
    Document,
    DocumentFieldValue,
    FieldDefinition,
    SyncHistory,
    Workspace,
)


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = [
            "id",
            "identifier",
            "name",
            "organization_identifier",
            "raw",
        ]
        read_only_fields = ["id"]


class CollectionSerializer(serializers.ModelSerializer):
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)

    class Meta:
        model = Collection
        fields = [
            "id",
            "identifier",
            "name",
            "workspace",
            "workspace_name",
            "raw",
        ]
        read_only_fields = ["id"]


class FieldDefinitionSerializer(serializers.ModelSerializer):
    collection_name = serializers.CharField(source="collection.name", read_only=True)

    class Meta:
        model = FieldDefinition
        fields = [
            "id",
            "collection",
            "collection_name",
            "datapoint_identifier",
            "name",
            "slug",
            "data_type",
            "raw",
        ]
        read_only_fields = ["id"]


class DataPointSerializer(serializers.ModelSerializer):
    class Meta:
        model = DataPoint
        fields = [
            "id",
            "identifier",
            "name",
            "slug",
            "description",
            "annotation_content_type",
            "organization_identifier",
            "extractor",
            "is_public",
            "raw",
        ]
        read_only_fields = ["id"]


class DocumentSerializer(serializers.ModelSerializer):
    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    collection_name = serializers.CharField(source="collection.name", read_only=True)

    class Meta:
        model = Document
        fields = [
            "id",
            "identifier",
            "custom_identifier",
            "file_name",
            "file_url",
            "review_url",
            "workspace",
            "workspace_name",
            "collection",
            "collection_name",
            "state",
            "is_confirmed",
            "in_review",
            "failed",
            "ready",
            "validatable",
            "has_challenges",
            "created_dt",
            "uploaded_dt",
            "last_updated_dt",
            "data",
            "meta",
            "tags",
            "raw",
        ]
        read_only_fields = ["id", "created_dt"]


class DocumentListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views without large JSON fields"""

    workspace_name = serializers.CharField(source="workspace.name", read_only=True)
    collection_name = serializers.CharField(source="collection.name", read_only=True)

    class Meta:
        model = Document
        fields = [
            "id",
            "identifier",
            "custom_identifier",
            "file_name",
            "file_url",
            "review_url",
            "workspace",
            "workspace_name",
            "collection",
            "collection_name",
            "state",
            "in_review",
            "failed",
            "ready",
            "created_dt",
            "last_updated_dt",
            "data",
            "raw",
        ]
        read_only_fields = ["id", "created_dt"]


class SyncHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SyncHistory
        fields = [
            "id",
            "sync_type",
            "started_at",
            "completed_at",
            "success",
            "records_synced",
            "error_message",
        ]
        read_only_fields = ["id", "started_at"]


class DocumentFieldValueSerializer(serializers.ModelSerializer):
    field_name = serializers.CharField(source="field_definition.name", read_only=True)
    field_slug = serializers.CharField(source="field_definition.slug", read_only=True)
    datapoint_identifier = serializers.CharField(
        source="field_definition.datapoint_identifier", read_only=True
    )

    class Meta:
        model = DocumentFieldValue
        fields = [
            "id",
            "document",
            "field_definition",
            "field_name",
            "field_slug",
            "datapoint_identifier",
            "value",
            "raw_value",
        ]
        read_only_fields = ["id"]


class CollectionViewSerializer(serializers.ModelSerializer):
    collection_name = serializers.CharField(source="collection.name", read_only=True)
    fields_count = serializers.SerializerMethodField()
    available_document_columns = serializers.SerializerMethodField()

    class Meta:
        model = CollectionView
        fields = [
            "id",
            "collection",
            "collection_name",
            "name",
            "sql_view_name",
            "description",
            "is_active",
            "include_fields",
            "include_document_columns",
            "last_refreshed_at",
            "error_message",
            "created_at",
            "updated_at",
            "fields_count",
            "available_document_columns",
        ]
        read_only_fields = [
            "id",
            "sql_view_name",
            "is_active",
            "last_refreshed_at",
            "error_message",
            "created_at",
            "updated_at",
            "fields_count",
            "available_document_columns",
        ]

    def get_fields_count(self, obj: CollectionView) -> int:
        if obj.include_fields:
            return len(obj.include_fields)
        return FieldDefinition.objects.filter(collection=obj.collection).count()

    def get_available_document_columns(self, obj: CollectionView) -> list[dict]:
        return [
            {"name": col[0], "label": col[1]}
            for col in CollectionView.DOCUMENT_COLUMNS
        ]


class CollectionViewCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new CollectionView."""

    class Meta:
        model = CollectionView
        fields = [
            "collection",
            "name",
            "description",
            "include_fields",
            "include_document_columns",
        ]

    def validate_name(self, value):
        """Ensure name is suitable for SQL view name generation."""
        if not value or len(value) < 2:
            raise serializers.ValidationError("Name must be at least 2 characters")
        return value

    def validate_include_document_columns(self, value):
        """Ensure only valid document columns are included."""
        if value:
            valid_columns = {col[0] for col in CollectionView.DOCUMENT_COLUMNS}
            invalid = set(value) - valid_columns
            if invalid:
                raise serializers.ValidationError(
                    f"Invalid document columns: {', '.join(invalid)}"
                )
        return value
