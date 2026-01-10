import os

import httpx
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from affinda_bridge.clients import AffindaClient
from affinda_bridge.models import Collection, DataPoint, Document, FieldDefinition, Workspace
from affinda_bridge.serializers import (
    CollectionSerializer,
    DataPointSerializer,
    DocumentListSerializer,
    DocumentSerializer,
    FieldDefinitionSerializer,
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
        organization = os.environ.get("AFFINDA_ORG_ID")
        if not organization:
            return Response(
                {"detail": "AFFINDA_ORG_ID not set"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        workspaces_upserted = 0
        collections_upserted = 0
        fields_upserted = 0
        fields_skipped = 0

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
