import os

import httpx
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from affinda_bridge.clients import AffindaClient
from affinda_bridge.models import (
    Collection,
    CollectionView,
    DataPoint,
    Document,
    DocumentFieldValue,
    ExternalTable,
    ExternalTableColumn,
    FieldDefinition,
    SyncHistory,
    SyncSchedule,
    Workspace,
)
from affinda_bridge.serializers import (
    CollectionSerializer,
    CollectionViewCreateSerializer,
    CollectionViewSerializer,
    DataPointSerializer,
    DocumentFieldValueSerializer,
    DocumentListSerializer,
    DocumentSerializer,
    ExternalTableColumnSerializer,
    ExternalTableCreateSerializer,
    ExternalTableSerializer,
    FieldDefinitionSerializer,
    SyncHistorySerializer,
    SyncLogEntrySerializer,
    SyncScheduleSerializer,
    WorkspaceSerializer,
)
from affinda_bridge.services import (
    ExternalTableBuilder,
    SQLViewBuilder,
    sync_document_field_values,
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

    @action(detail=True, methods=["post"], url_path="full-sync")
    def full_sync(self, request, identifier=None):
        """
        Start a full collection sync from Affinda.
        This runs in the background and returns immediately with a sync_id.
        """
        from affinda_bridge.tasks import run_full_collection_sync

        collection = self.get_object()

        # Create sync history record
        sync_history = SyncHistory.objects.create(
            sync_type=SyncHistory.SYNC_TYPE_FULL_COLLECTION,
            status=SyncHistory.STATUS_PENDING,
            collection=collection,
        )

        # Start background sync
        run_full_collection_sync(collection.id, sync_history.id)

        return Response({
            "success": True,
            "message": "Full collection sync started",
            "sync_id": sync_history.id,
            "collection_identifier": collection.identifier,
        })

    @action(detail=True, methods=["get"], url_path="sync-status")
    def sync_status(self, request, identifier=None):
        """
        Get the latest sync status for this collection.
        """
        collection = self.get_object()

        # Get the most recent sync for this collection
        latest_sync = SyncHistory.objects.filter(
            collection=collection,
            sync_type__in=[
                SyncHistory.SYNC_TYPE_FULL_COLLECTION,
                SyncHistory.SYNC_TYPE_SELECTIVE,
            ],
        ).order_by("-started_at").first()

        if not latest_sync:
            return Response({
                "has_sync": False,
                "message": "No sync history found for this collection",
            })

        return Response({
            "has_sync": True,
            "sync_id": latest_sync.id,
            "sync_type": latest_sync.sync_type,
            "status": latest_sync.status,
            "started_at": latest_sync.started_at,
            "completed_at": latest_sync.completed_at,
            "success": latest_sync.success,
            "total_documents": latest_sync.total_documents,
            "documents_created": latest_sync.documents_created,
            "documents_updated": latest_sync.documents_updated,
            "documents_failed": latest_sync.documents_failed,
            "progress_percent": latest_sync.progress_percent,
            "error_message": latest_sync.error_message,
        })


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

    @action(detail=True, methods=["post"])
    def refresh(self, request, pk=None):
        """Refresh document data from Affinda API"""
        document = self.get_object()

        try:
            # Fetch latest data from Affinda
            client = AffindaClient()
            affinda_doc = client.get_document(identifier=document.identifier)

            # Update document fields
            document.custom_identifier = affinda_doc.get("customIdentifier", "") or ""
            document.file_name = affinda_doc.get("fileName", "") or document.file_name
            document.file_url = affinda_doc.get("fileUrl", "") or ""
            document.review_url = affinda_doc.get("reviewUrl", "") or ""
            document.state = affinda_doc.get("state", "") or "unknown"
            document.is_confirmed = affinda_doc.get("isConfirmed", False)
            document.in_review = affinda_doc.get("inReview", False)
            document.failed = affinda_doc.get("failed", False)
            document.ready = affinda_doc.get("ready", False)
            document.validatable = affinda_doc.get("validatable", False)
            document.has_challenges = affinda_doc.get("hasChallenges", False)

            # Parse dates
            uploaded_dt = affinda_doc.get("uploadedDt")
            if uploaded_dt:
                document.uploaded_dt = uploaded_dt

            last_updated = affinda_doc.get("lastUpdatedDt")
            if last_updated:
                document.last_updated_dt = last_updated

            # Update JSON fields
            document.data = affinda_doc.get("data", {}) or {}
            document.meta = affinda_doc.get("meta", {}) or {}
            document.tags = affinda_doc.get("tags", []) or []
            document.raw = affinda_doc

            document.save()

            # Sync field values from the updated data
            synced_count = sync_document_field_values(document)

            return Response({
                "success": True,
                "message": f"Document refreshed successfully. {synced_count} field values synced.",
                "document": DocumentSerializer(document).data,
            })

        except Exception as e:
            return Response(
                {"success": False, "message": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["patch"], url_path="toggle-sync")
    def toggle_sync(self, request, pk=None):
        """Toggle the sync_enabled flag for a document."""
        document = self.get_object()

        # If sync_enabled is provided in request, use it; otherwise toggle
        if "sync_enabled" in request.data:
            document.sync_enabled = request.data["sync_enabled"]
        else:
            document.sync_enabled = not document.sync_enabled

        document.save(update_fields=["sync_enabled"])

        return Response({
            "success": True,
            "document_id": document.id,
            "sync_enabled": document.sync_enabled,
        })

    @action(detail=False, methods=["post"], url_path="selective-sync")
    def selective_sync(self, request):
        """
        Start a selective sync for all documents with sync_enabled=True.
        Optionally filter by collection using query parameter.
        """
        from affinda_bridge.tasks import run_selective_sync

        collection_id = request.data.get("collection_id") or request.query_params.get("collection_id")

        # Get collection for the sync history record if provided
        collection = None
        if collection_id:
            try:
                collection = Collection.objects.get(id=collection_id)
            except Collection.DoesNotExist:
                return Response(
                    {"error": f"Collection with id {collection_id} not found"},
                    status=status.HTTP_404_NOT_FOUND,
                )

        # Create sync history record
        sync_history = SyncHistory.objects.create(
            sync_type=SyncHistory.SYNC_TYPE_SELECTIVE,
            status=SyncHistory.STATUS_PENDING,
            collection=collection,
        )

        # Start background sync
        run_selective_sync(sync_history.id, collection_id=int(collection_id) if collection_id else None)

        return Response({
            "success": True,
            "message": "Selective sync started",
            "sync_id": sync_history.id,
            "collection_id": collection_id,
        })


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

    @action(detail=True, methods=["get"])
    def logs(self, request, pk=None):
        """
        Get log entries for a specific sync history.

        Query params:
        - level: Filter by log level (debug, info, warning, error)
        - document: Filter by document identifier
        """
        sync_history = self.get_object()
        logs = sync_history.log_entries.all()

        # Filter by level if provided
        level = request.query_params.get("level")
        if level:
            logs = logs.filter(level=level)

        # Filter by document if provided
        document = request.query_params.get("document")
        if document:
            logs = logs.filter(document_identifier__icontains=document)

        serializer = SyncLogEntrySerializer(logs, many=True)
        return Response({
            "sync_id": sync_history.id,
            "sync_type": sync_history.sync_type,
            "status": sync_history.status,
            "total_entries": logs.count(),
            "entries": serializer.data,
        })


class CollectionViewViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing SQL views for collections.

    Endpoints:
    - GET /api/collection-views/ - List all views
    - POST /api/collection-views/ - Create a new view definition
    - GET /api/collection-views/{id}/ - Get view details
    - PUT /api/collection-views/{id}/ - Update view definition
    - DELETE /api/collection-views/{id}/ - Delete view definition and drop SQL view
    - POST /api/collection-views/{id}/activate/ - Create SQL view in database
    - POST /api/collection-views/{id}/deactivate/ - Drop SQL view from database
    - POST /api/collection-views/{id}/refresh/ - Refresh (drop and recreate) SQL view
    - POST /api/collection-views/{id}/sync-data/ - Sync DocumentFieldValues for collection
    - GET /api/collection-views/{id}/preview/ - Preview the SQL that would be generated
    """

    queryset = CollectionView.objects.select_related("collection").all()
    serializer_class = CollectionViewSerializer
    filterset_fields = ["collection", "is_active"]

    def get_serializer_class(self):
        if self.action == "create":
            return CollectionViewCreateSerializer
        return CollectionViewSerializer

    def perform_destroy(self, instance):
        """Drop the SQL view before deleting the record."""
        if instance.is_active:
            builder = SQLViewBuilder(instance)
            builder.drop_view()
        instance.delete()

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        """Create the SQL view in the database."""
        collection_view = self.get_object()
        builder = SQLViewBuilder(collection_view)
        success, message = builder.create_view()

        return Response(
            {
                "success": success,
                "message": message,
                "is_active": collection_view.is_active,
            },
            status=status.HTTP_200_OK if success else status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        """Drop the SQL view from the database."""
        collection_view = self.get_object()
        builder = SQLViewBuilder(collection_view)
        success, message = builder.drop_view()

        return Response(
            {
                "success": success,
                "message": message,
                "is_active": collection_view.is_active,
            },
            status=status.HTTP_200_OK if success else status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"])
    def refresh(self, request, pk=None):
        """Refresh the SQL view (drop and recreate with current schema)."""
        collection_view = self.get_object()
        builder = SQLViewBuilder(collection_view)
        success, message = builder.refresh_view()

        return Response(
            {
                "success": success,
                "message": message,
                "is_active": collection_view.is_active,
                "last_refreshed_at": collection_view.last_refreshed_at,
            },
            status=status.HTTP_200_OK if success else status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        """Preview the SQL that would be generated for this view."""
        from affinda_bridge.models import CollectionView as CollectionViewModel

        collection_view = self.get_object()
        builder = SQLViewBuilder(collection_view)

        try:
            create_sql = builder.build_create_sql()
            drop_sql = builder.build_drop_sql()
            fields = builder.get_fields()
            document_columns = builder.get_document_columns()

            return Response(
                {
                    "create_sql": create_sql,
                    "drop_sql": drop_sql,
                    "document_columns": document_columns,
                    "available_document_columns": [
                        {"name": col[0], "label": col[1]}
                        for col in CollectionViewModel.DOCUMENT_COLUMNS
                    ],
                    "fields": [
                        {
                            "id": f.id,
                            "name": f.name,
                            "slug": f.slug,
                            "column_name": builder._sanitize_column_name(
                                f.slug or f.name or f.datapoint_identifier
                            ),
                        }
                        for f in fields
                    ],
                    "db_engine": builder.db_engine,
                }
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class DocumentFieldValueViewSet(viewsets.ReadOnlyModelViewSet):
    """API endpoint for viewing document field values."""

    queryset = DocumentFieldValue.objects.select_related(
        "document", "field_definition"
    ).all()
    serializer_class = DocumentFieldValueSerializer
    filterset_fields = ["document", "field_definition"]


class ExternalTableViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing external tables for collections.

    Endpoints:
    - GET /api/external-tables/ - List all external tables
    - POST /api/external-tables/ - Create a new external table definition
    - GET /api/external-tables/{id}/ - Get table details
    - PUT /api/external-tables/{id}/ - Update table definition
    - DELETE /api/external-tables/{id}/ - Delete table definition and drop SQL table
    - POST /api/external-tables/{id}/activate/ - Create table in database
    - POST /api/external-tables/{id}/deactivate/ - Drop table from database
    - POST /api/external-tables/{id}/rebuild/ - Rebuild (drop and recreate) table
    - GET /api/external-tables/{id}/preview/ - Preview the SQL that would be generated
    """

    queryset = ExternalTable.objects.select_related("collection").prefetch_related(
        "columns"
    ).all()
    serializer_class = ExternalTableSerializer
    filterset_fields = ["collection", "is_active"]

    def get_serializer_class(self):
        if self.action == "create":
            return ExternalTableCreateSerializer
        return ExternalTableSerializer

    def perform_destroy(self, instance):
        """Drop the SQL table before deleting the record."""
        if instance.is_active:
            builder = ExternalTableBuilder(instance)
            builder.drop_table()
        instance.delete()

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        """Create the external table in the database."""
        external_table = self.get_object()

        if external_table.columns.count() == 0:
            return Response(
                {"success": False, "message": "Cannot create table without columns"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        builder = ExternalTableBuilder(external_table)
        success, message = builder.create_table()

        return Response(
            {
                "success": success,
                "message": message,
                "is_active": external_table.is_active,
            },
            status=status.HTTP_200_OK if success else status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"])
    def deactivate(self, request, pk=None):
        """Drop the external table from the database."""
        external_table = self.get_object()
        builder = ExternalTableBuilder(external_table)
        success, message = builder.drop_table()

        return Response(
            {
                "success": success,
                "message": message,
                "is_active": external_table.is_active,
            },
            status=status.HTTP_200_OK if success else status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"])
    def rebuild(self, request, pk=None):
        """Rebuild the table (drop and recreate with current schema)."""
        external_table = self.get_object()
        builder = ExternalTableBuilder(external_table)
        success, message = builder.rebuild_table()

        return Response(
            {
                "success": success,
                "message": message,
                "is_active": external_table.is_active,
            },
            status=status.HTTP_200_OK if success else status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["get"])
    def preview(self, request, pk=None):
        """Preview the SQL that would be generated for this table."""
        external_table = self.get_object()
        builder = ExternalTableBuilder(external_table)

        try:
            return Response(
                {
                    "create_sql": builder.build_create_sql(),
                    "drop_sql": builder.build_drop_sql(),
                    "columns": [
                        {
                            "name": col.name,
                            "sql_column_name": col.sql_column_name,
                            "data_type": col.data_type,
                            "sql_type": builder._get_sql_type(col.data_type),
                        }
                        for col in builder.get_columns()
                    ],
                    "db_engine": builder.db_engine,
                }
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class ExternalTableColumnViewSet(viewsets.ModelViewSet):
    """API endpoint for managing columns within an external table."""

    queryset = ExternalTableColumn.objects.select_related("external_table").all()
    serializer_class = ExternalTableColumnSerializer
    filterset_fields = ["external_table", "data_type"]

    def perform_create(self, serializer):
        """Create column and add to database if table is active."""
        column = serializer.save()

        # If the table is active, add the column via ALTER TABLE
        if column.external_table.is_active:
            from affinda_bridge.services import ExternalTableBuilder

            builder = ExternalTableBuilder(column.external_table)
            success, msg = builder.add_column(column)

            if not success:
                # Rollback the column creation
                column.delete()
                from rest_framework.exceptions import ValidationError

                raise ValidationError(f"Failed to add column to database: {msg}")

    def perform_destroy(self, instance):
        """Delete column and drop from database if table is active."""
        if instance.external_table.is_active:
            from affinda_bridge.services import ExternalTableBuilder

            builder = ExternalTableBuilder(instance.external_table)
            success, msg = builder.drop_column(instance)

            if not success:
                from rest_framework.exceptions import ValidationError

                raise ValidationError(f"Failed to drop column from database: {msg}")

        instance.delete()


class SyncScheduleViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing sync schedules.

    Endpoints:
    - GET /api/sync-schedules/ - List all schedules
    - POST /api/sync-schedules/ - Create a new schedule
    - GET /api/sync-schedules/{id}/ - Get schedule details
    - PUT/PATCH /api/sync-schedules/{id}/ - Update schedule
    - DELETE /api/sync-schedules/{id}/ - Delete schedule
    - POST /api/sync-schedules/{id}/run-now/ - Manually trigger schedule
    - GET /api/sync-schedules/{id}/history/ - Get run history for schedule
    """

    queryset = SyncSchedule.objects.select_related("collection", "plugin_instance").all()
    serializer_class = SyncScheduleSerializer
    filterset_fields = ["collection", "sync_type", "enabled", "plugin_instance"]

    @action(detail=True, methods=["post"], url_path="run-now")
    def run_now(self, request, pk=None):
        """Manually trigger this schedule to run immediately."""
        from affinda_bridge.services import run_schedule

        schedule = self.get_object()

        if not schedule.collection and schedule.sync_type == "full_collection":
            return Response(
                {"error": "Cannot run full collection sync without a collection"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not schedule.plugin_instance and schedule.sync_type == "data_source":
            return Response(
                {"error": "Cannot run data source sync without a plugin instance"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            sync_history = run_schedule(schedule, triggered_by="manual")
            return Response({
                "success": True,
                "message": f"Schedule '{schedule.name}' triggered manually",
                "sync_id": sync_history.id if sync_history else None,
            })
        except Exception as e:
            return Response(
                {"success": False, "error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        """Get the run history for this schedule."""
        from affinda_bridge.models import SyncScheduleRun
        from affinda_bridge.serializers import SyncScheduleRunSerializer

        schedule = self.get_object()
        runs = SyncScheduleRun.objects.filter(schedule=schedule).order_by("-started_at")[:50]

        return Response({
            "schedule_id": schedule.id,
            "schedule_name": schedule.name,
            "runs": SyncScheduleRunSerializer(runs, many=True).data,
        })

    @action(detail=False, methods=["get"])
    def presets(self, request):
        """Get available cron expression presets."""
        return Response({
            "presets": [
                {"label": "Every Hour", "value": "0 * * * *"},
                {"label": "Every 6 Hours", "value": "0 */6 * * *"},
                {"label": "Daily at Midnight", "value": "0 0 * * *"},
                {"label": "Daily at 2am (Recommended)", "value": "0 2 * * *"},
                {"label": "Weekly on Sunday", "value": "0 0 * * 0"},
            ],
            "sync_types": [
                {"value": "full_collection", "label": "Full Collection Sync"},
                {"value": "selective", "label": "Selective Sync"},
                {"value": "data_source", "label": "Data Source Sync"},
            ],
        })

    @action(detail=False, methods=["get"], url_path="data-source-instances")
    def data_source_instances(self, request):
        """Get available data source plugin instances for scheduling."""
        from plugins.models import PluginComponent, PluginInstance

        instances = PluginInstance.objects.filter(
            enabled=True,
            component__component_type=PluginComponent.COMPONENT_TYPE_DATASOURCE,
            component__plugin__enabled=True,
        ).select_related("component", "component__plugin")

        return Response({
            "instances": [
                {
                    "id": instance.id,
                    "name": instance.name,
                    "component_name": instance.component.name,
                    "plugin_name": instance.component.plugin.name,
                    "affinda_data_source": instance.affinda_data_source,
                }
                for instance in instances
            ]
        })

    @action(detail=False, methods=["get"], url_path="all-runs")
    def all_runs(self, request):
        """Get recent runs from all schedules, ordered by start time."""
        from affinda_bridge.models import SyncScheduleRun
        from affinda_bridge.serializers import SyncScheduleRunSerializer

        limit = int(request.query_params.get("limit", 50))
        runs = (
            SyncScheduleRun.objects
            .select_related("schedule", "sync_history")
            .order_by("-started_at")[:limit]
        )

        return Response({
            "runs": SyncScheduleRunSerializer(runs, many=True).data,
            "total": SyncScheduleRun.objects.count(),
        })
