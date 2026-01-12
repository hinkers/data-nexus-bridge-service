import os

import httpx
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from affinda_bridge.clients import AffindaClient
from affinda_bridge.models import Collection, DataPoint, Document, FieldDefinition, SyncHistory, Workspace
from affinda_bridge.serializers import (
    CollectionSerializer,
    DataPointSerializer,
    DocumentListSerializer,
    DocumentSerializer,
    FieldDefinitionSerializer,
    SyncHistorySerializer,
    WorkspaceSerializer,
)


class WorkspaceViewSet(viewsets.ReadOnlyModelViewSet):
    """API endpoint for viewing workspaces"""

    queryset = Workspace.objects.all()
    serializer_class = WorkspaceSerializer
    lookup_field = "identifier"

    @action(detail=False, methods=["post"])
    def sync(self, request):
        """
        Sync workspaces, collections, and field definitions from Affinda API.
        This is the DRF version of the sync_field_definitions view.
        """
        # Create sync history records
        sync_workspaces = SyncHistory.objects.create(sync_type=SyncHistory.SYNC_TYPE_WORKSPACES)
        sync_collections = SyncHistory.objects.create(sync_type=SyncHistory.SYNC_TYPE_COLLECTIONS)
        sync_fields = SyncHistory.objects.create(sync_type=SyncHistory.SYNC_TYPE_FIELD_DEFINITIONS)

        organization = os.environ.get("AFFINDA_ORG_ID")
        if not organization:
            error_msg = "AFFINDA_ORG_ID not set"
            for sync_record in [sync_workspaces, sync_collections, sync_fields]:
                sync_record.completed_at = timezone.now()
                sync_record.success = False
                sync_record.error_message = error_msg
                sync_record.save()
            return Response(
                {"detail": error_msg},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        workspaces_upserted = 0
        collections_upserted = 0
        fields_upserted = 0
        fields_skipped = 0

        try:
            with AffindaClient() as client:
                workspaces = client.list_workspaces(organization=organization)
                data_points = client.list_data_points(
                    organization=organization,
                    include_public=True,
                )

                for workspace in workspaces:
                    workspace_id = workspace.get("identifier")
                    if not workspace_id:
                        continue
                    workspace_obj, _ = Workspace.objects.update_or_create(
                        identifier=workspace_id,
                        defaults={
                            "name": workspace.get("name", ""),
                            "organization_identifier": organization,
                            "raw": workspace,
                        },
                    )
                    workspaces_upserted += 1

                    collections = client.list_collections(
                        workspace=workspace_obj.identifier,
                    )
                    for collection in collections:
                        collection_id = collection.get("identifier")
                        if not collection_id:
                            continue
                        collection_obj, _ = Collection.objects.update_or_create(
                            identifier=collection_id,
                            defaults={
                                "name": collection.get("name", ""),
                                "workspace": workspace_obj,
                                "raw": collection,
                            },
                        )
                        collections_upserted += 1

                        for datapoint in data_points:
                            datapoint_id = datapoint.get("identifier")
                            if not datapoint_id:
                                continue
                            try:
                                field = client.get_collection_field(
                                    collection_identifier=collection_obj.identifier,
                                    datapoint_identifier=datapoint_id,
                                )
                            except httpx.HTTPStatusError as exc:
                                if exc.response is not None and exc.response.status_code == 404:
                                    fields_skipped += 1
                                    continue
                                raise

                            FieldDefinition.objects.update_or_create(
                                collection=collection_obj,
                                datapoint_identifier=datapoint_id,
                                defaults={
                                    "name": field.get("name", "") or datapoint.get("name", ""),
                                    "slug": field.get("slug", "") or datapoint.get("slug", ""),
                                    "data_type": field.get("annotationContentType", "")
                                    or datapoint.get("annotationContentType", "")
                                    or datapoint.get("annotation_content_type", ""),
                                    "raw": field,
                                },
                            )
                            fields_upserted += 1

            # Mark all syncs as successful
            sync_workspaces.completed_at = timezone.now()
            sync_workspaces.success = True
            sync_workspaces.records_synced = workspaces_upserted
            sync_workspaces.save()

            sync_collections.completed_at = timezone.now()
            sync_collections.success = True
            sync_collections.records_synced = collections_upserted
            sync_collections.save()

            sync_fields.completed_at = timezone.now()
            sync_fields.success = True
            sync_fields.records_synced = fields_upserted
            sync_fields.save()

        except Exception as e:
            # Mark all syncs as failed
            error_msg = str(e)
            for sync_record in [sync_workspaces, sync_collections, sync_fields]:
                sync_record.completed_at = timezone.now()
                sync_record.success = False
                sync_record.error_message = error_msg
                sync_record.save()
            raise

        return Response(
            {
                "workspaces_upserted": workspaces_upserted,
                "collections_upserted": collections_upserted,
                "fields_upserted": fields_upserted,
                "fields_skipped": fields_skipped,
            }
        )


class CollectionViewSet(viewsets.ReadOnlyModelViewSet):
    """API endpoint for viewing collections"""

    queryset = Collection.objects.select_related("workspace").all()
    serializer_class = CollectionSerializer
    lookup_field = "identifier"
    filterset_fields = ["workspace"]


class FieldDefinitionViewSet(viewsets.ReadOnlyModelViewSet):
    """API endpoint for viewing field definitions"""

    queryset = FieldDefinition.objects.select_related("collection").all()
    serializer_class = FieldDefinitionSerializer
    filterset_fields = ["collection", "datapoint_identifier"]


class DataPointViewSet(viewsets.ReadOnlyModelViewSet):
    """API endpoint for viewing data points"""

    queryset = DataPoint.objects.all()
    serializer_class = DataPointSerializer
    lookup_field = "identifier"
    filterset_fields = ["organization_identifier", "is_public"]


class DocumentViewSet(viewsets.ReadOnlyModelViewSet):
    """API endpoint for viewing documents"""

    queryset = Document.objects.select_related("workspace", "collection").all()
    filterset_fields = [
        "workspace",
        "collection",
        "state",
        "in_review",
        "failed",
        "ready",
        "custom_identifier",
    ]

    def get_serializer_class(self):
        """Use lightweight serializer for list view"""
        if self.action == "list":
            return DocumentListSerializer
        return DocumentSerializer

    def get_queryset(self):
        """Optimize queryset for list vs detail views"""
        queryset = super().get_queryset()
        if self.action == "list":
            # Don't load heavy JSON fields for list view
            return queryset.defer("data", "meta", "raw")
        return queryset


class SyncHistoryViewSet(viewsets.ReadOnlyModelViewSet):
    """API endpoint for viewing sync history"""

    queryset = SyncHistory.objects.all()
    serializer_class = SyncHistorySerializer
    filterset_fields = ["sync_type", "success"]

    @action(detail=False, methods=["get"])
    def latest(self, request):
        """Get the latest sync for each sync type"""
        sync_types = [
            SyncHistory.SYNC_TYPE_WORKSPACES,
            SyncHistory.SYNC_TYPE_COLLECTIONS,
            SyncHistory.SYNC_TYPE_FIELD_DEFINITIONS,
        ]

        latest_syncs = {}
        for sync_type in sync_types:
            latest = SyncHistory.objects.filter(
                sync_type=sync_type,
                success=True
            ).order_by('-completed_at').first()

            if latest:
                latest_syncs[sync_type] = SyncHistorySerializer(latest).data

        return Response(latest_syncs)
