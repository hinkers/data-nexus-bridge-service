"""
Service for syncing documents from Affinda API.
Provides functions for single document, full collection, and selective syncs.
"""

import logging
from typing import Optional

from django.db import transaction
from django.utils import timezone

from affinda_bridge.clients import AffindaClient
from affinda_bridge.models import Collection, Document, SyncHistory
from affinda_bridge.services.field_value_sync import sync_document_field_values

logger = logging.getLogger(__name__)

# Batch size for API calls
BATCH_SIZE = 100


def sync_single_document(identifier: str) -> Optional[Document]:
    """
    Fetch a single document from Affinda and create/update it in the database.

    Args:
        identifier: The Affinda document identifier

    Returns:
        The synced Document instance, or None if sync failed
    """
    try:
        with AffindaClient() as client:
            doc_data = client.get_document(identifier=identifier)

        if not doc_data:
            logger.error(f"Document {identifier} not found in Affinda")
            return None

        document = _create_or_update_document(doc_data)
        if document:
            sync_document_field_values(document)
            logger.info(f"Successfully synced document {identifier}")

        return document

    except Exception as e:
        logger.exception(f"Failed to sync document {identifier}: {e}")
        return None


def full_collection_sync(
    collection: Collection,
    sync_history: SyncHistory,
) -> int:
    """
    Sync all documents from a collection in Affinda.
    Updates progress in the provided SyncHistory record.

    Args:
        collection: The Collection to sync
        sync_history: SyncHistory record to update with progress

    Returns:
        Total number of documents synced
    """
    logger.info(f"Starting full collection sync for {collection.name}")

    sync_history.status = SyncHistory.STATUS_IN_PROGRESS
    sync_history.save(update_fields=["status"])

    total_synced = 0
    documents_created = 0
    documents_updated = 0
    documents_failed = 0
    offset = 0

    try:
        with AffindaClient() as client:
            # First, get the total count
            initial_response = client.list_documents(
                collection=collection.identifier,
                limit=1,
                count=True,
            )
            total_count = initial_response.get("count", 0)
            sync_history.total_documents = total_count
            sync_history.save(update_fields=["total_documents"])

            logger.info(f"Found {total_count} documents in collection {collection.name}")

            # Paginate through all documents
            while True:
                response = client.list_documents(
                    collection=collection.identifier,
                    offset=offset,
                    limit=BATCH_SIZE,
                    include_data=True,
                )

                documents = response.get("results", [])
                if not documents:
                    break

                for doc_data in documents:
                    try:
                        existing = Document.objects.filter(
                            identifier=doc_data.get("identifier")
                        ).exists()

                        document = _create_or_update_document(doc_data)
                        if document:
                            sync_document_field_values(document)
                            total_synced += 1

                            if existing:
                                documents_updated += 1
                            else:
                                documents_created += 1
                        else:
                            documents_failed += 1

                    except Exception as e:
                        logger.error(f"Failed to sync document: {e}")
                        documents_failed += 1

                # Update progress
                offset += len(documents)
                if total_count > 0:
                    progress = min(int((offset / total_count) * 100), 100)
                else:
                    progress = 100

                sync_history.documents_created = documents_created
                sync_history.documents_updated = documents_updated
                sync_history.documents_failed = documents_failed
                sync_history.progress_percent = progress
                sync_history.records_synced = total_synced
                sync_history.save(update_fields=[
                    "documents_created",
                    "documents_updated",
                    "documents_failed",
                    "progress_percent",
                    "records_synced",
                ])

                logger.info(
                    f"Progress: {offset}/{total_count} documents processed "
                    f"({progress}%)"
                )

                # Check if we've processed all documents
                if offset >= total_count:
                    break

        # Mark as completed
        sync_history.status = SyncHistory.STATUS_COMPLETED
        sync_history.success = True
        sync_history.completed_at = timezone.now()
        sync_history.progress_percent = 100
        sync_history.save()

        logger.info(
            f"Full collection sync completed for {collection.name}: "
            f"{documents_created} created, {documents_updated} updated, "
            f"{documents_failed} failed"
        )

    except Exception as e:
        logger.exception(f"Full collection sync failed for {collection.name}: {e}")
        sync_history.status = SyncHistory.STATUS_FAILED
        sync_history.success = False
        sync_history.error_message = str(e)
        sync_history.completed_at = timezone.now()
        sync_history.save()

    return total_synced


def selective_document_sync(
    sync_history: SyncHistory,
    collection_id: Optional[int] = None,
) -> int:
    """
    Sync only documents that have sync_enabled=True.
    Optionally filter by collection.

    Args:
        sync_history: SyncHistory record to update with progress
        collection_id: Optional collection ID to filter by

    Returns:
        Total number of documents synced
    """
    logger.info("Starting selective document sync")

    sync_history.status = SyncHistory.STATUS_IN_PROGRESS
    sync_history.save(update_fields=["status"])

    # Get documents to sync
    queryset = Document.objects.filter(sync_enabled=True)
    if collection_id:
        queryset = queryset.filter(collection_id=collection_id)

    document_ids = list(queryset.values_list("identifier", flat=True))
    total_count = len(document_ids)

    sync_history.total_documents = total_count
    sync_history.save(update_fields=["total_documents"])

    logger.info(f"Found {total_count} documents to sync")

    total_synced = 0
    documents_updated = 0
    documents_failed = 0

    try:
        with AffindaClient() as client:
            for i, identifier in enumerate(document_ids):
                try:
                    doc_data = client.get_document(identifier=identifier)
                    if doc_data:
                        document = _create_or_update_document(doc_data)
                        if document:
                            sync_document_field_values(document)
                            total_synced += 1
                            documents_updated += 1
                        else:
                            documents_failed += 1
                    else:
                        documents_failed += 1

                except Exception as e:
                    logger.error(f"Failed to sync document {identifier}: {e}")
                    documents_failed += 1

                # Update progress
                progress = min(int(((i + 1) / total_count) * 100), 100) if total_count > 0 else 100
                sync_history.documents_updated = documents_updated
                sync_history.documents_failed = documents_failed
                sync_history.progress_percent = progress
                sync_history.records_synced = total_synced
                sync_history.save(update_fields=[
                    "documents_updated",
                    "documents_failed",
                    "progress_percent",
                    "records_synced",
                ])

        # Mark as completed
        sync_history.status = SyncHistory.STATUS_COMPLETED
        sync_history.success = True
        sync_history.completed_at = timezone.now()
        sync_history.progress_percent = 100
        sync_history.save()

        logger.info(
            f"Selective sync completed: {documents_updated} updated, "
            f"{documents_failed} failed"
        )

    except Exception as e:
        logger.exception(f"Selective sync failed: {e}")
        sync_history.status = SyncHistory.STATUS_FAILED
        sync_history.success = False
        sync_history.error_message = str(e)
        sync_history.completed_at = timezone.now()
        sync_history.save()

    return total_synced


def _create_or_update_document(doc_data: dict) -> Optional[Document]:
    """
    Create or update a Document from Affinda API response data.

    Args:
        doc_data: Document data from Affinda API

    Returns:
        The created/updated Document, or None if failed
    """
    identifier = doc_data.get("identifier")
    if not identifier:
        logger.warning("Document data missing identifier")
        return None

    try:
        # Find workspace and collection
        workspace = None
        collection = None

        workspace_data = doc_data.get("workspace")
        if workspace_data:
            from affinda_bridge.models import Workspace
            workspace_id = workspace_data.get("identifier") if isinstance(workspace_data, dict) else workspace_data
            if workspace_id:
                workspace = Workspace.objects.filter(identifier=workspace_id).first()

        collection_data = doc_data.get("collection")
        if collection_data:
            collection_id = collection_data.get("identifier") if isinstance(collection_data, dict) else collection_data
            if collection_id:
                collection = Collection.objects.filter(identifier=collection_id).first()

        with transaction.atomic():
            document, created = Document.objects.update_or_create(
                identifier=identifier,
                defaults={
                    "custom_identifier": doc_data.get("custom_identifier", "") or "",
                    "file_name": doc_data.get("file_name", "") or doc_data.get("fileName", "") or "",
                    "file_url": doc_data.get("file_url", "") or doc_data.get("fileUrl", "") or "",
                    "review_url": doc_data.get("review_url", "") or doc_data.get("reviewUrl", "") or "",
                    "workspace": workspace,
                    "collection": collection,
                    "state": doc_data.get("state", "") or "",
                    "is_confirmed": doc_data.get("is_confirmed", False) or doc_data.get("isConfirmed", False) or False,
                    "in_review": doc_data.get("in_review", False) or doc_data.get("inReview", False) or False,
                    "failed": doc_data.get("failed", False) or False,
                    "ready": doc_data.get("ready", False) or False,
                    "validatable": doc_data.get("validatable", False) or False,
                    "has_challenges": doc_data.get("has_challenges", False) or doc_data.get("hasChallenges", False) or False,
                    "data": doc_data.get("data", {}) or {},
                    "meta": doc_data.get("meta", {}) or {},
                    "tags": doc_data.get("tags", []) or [],
                    "raw": doc_data,
                    "last_updated_dt": timezone.now(),
                },
            )

            # Parse dates if present
            created_dt = doc_data.get("created_dt") or doc_data.get("createdDt")
            if created_dt:
                try:
                    from django.utils.dateparse import parse_datetime
                    parsed = parse_datetime(created_dt)
                    if parsed:
                        document.created_dt = parsed
                except Exception:
                    pass

            uploaded_dt = doc_data.get("uploaded_dt") or doc_data.get("uploadedDt")
            if uploaded_dt:
                try:
                    from django.utils.dateparse import parse_datetime
                    parsed = parse_datetime(uploaded_dt)
                    if parsed:
                        document.uploaded_dt = parsed
                except Exception:
                    pass

            document.save()

        action = "Created" if created else "Updated"
        logger.debug(f"{action} document {identifier}")
        return document

    except Exception as e:
        logger.exception(f"Failed to create/update document {identifier}: {e}")
        return None
