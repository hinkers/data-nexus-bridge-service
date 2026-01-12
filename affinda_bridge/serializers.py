from rest_framework import serializers

from affinda_bridge.models import (
    Collection,
    DataPoint,
    Document,
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
