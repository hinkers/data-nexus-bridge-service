"""
Service for syncing documents from Affinda API.
Provides functions for single document, full collection, and selective syncs.
"""

import logging
from typing import Optional

from django.db import transaction
from django.utils import timezone

from affinda_bridge.clients import AffindaClient
from affinda_bridge.models import Collection, Document, SyncHistory, SyncLogEntry
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
    Sync all documents from a collection/document type in Affinda.
    Updates progress in the provided SyncHistory record.

    Note: If no documents are found querying by collection/document_type,
    this will fall back to querying by workspace to capture all documents
    including those not yet assigned to a document type.

    Args:
        collection: The Collection (document type) to sync
        sync_history: SyncHistory record to update with progress

    Returns:
        Total number of documents synced
    """
    logger.info(f"Starting full sync for document type: {collection.name}")
    SyncLogEntry.info(sync_history, f"Starting full sync for document type: {collection.name}")

    sync_history.status = SyncHistory.STATUS_IN_PROGRESS
    sync_history.save(update_fields=["status"])

    total_synced = 0
    documents_created = 0
    documents_updated = 0
    documents_failed = 0
    offset = 0

    try:
        with AffindaClient() as client:
            # First, try to get documents by collection/document_type identifier
            initial_response = client.list_documents(
                collection=collection.identifier,
                limit=1,
                count=True,
            )
            total_count = initial_response.get("count", 0)
            query_mode = "collection"

            logger.info(f"Query by document_type '{collection.identifier}' found {total_count} documents")

            # If no documents found by collection, try workspace
            if total_count == 0 and collection.workspace:
                workspace_response = client.list_documents(
                    workspace=collection.workspace.identifier,
                    limit=1,
                    count=True,
                )
                workspace_count = workspace_response.get("count", 0)
                logger.info(f"Query by workspace '{collection.workspace.identifier}' found {workspace_count} documents")

                if workspace_count > 0:
                    total_count = workspace_count
                    query_mode = "workspace"
                    SyncLogEntry.info(
                        sync_history,
                        f"No documents found by document type, falling back to workspace query. Found {workspace_count} documents"
                    )

            sync_history.total_documents = total_count
            sync_history.save(update_fields=["total_documents"])

            logger.info(f"Found {total_count} documents for {collection.name} (query mode: {query_mode})")
            SyncLogEntry.info(sync_history, f"Found {total_count} documents to sync (query mode: {query_mode})")

            # Paginate through all documents
            # Note: include_data is deprecated, we fetch document IDs then get each document
            batch_number = 0
            while True:
                batch_number += 1

                # Use appropriate query based on what returned results
                if query_mode == "workspace" and collection.workspace:
                    response = client.list_documents(
                        workspace=collection.workspace.identifier,
                        offset=offset,
                        limit=BATCH_SIZE,
                    )
                else:
                    response = client.list_documents(
                        collection=collection.identifier,
                        offset=offset,
                        limit=BATCH_SIZE,
                    )

                documents = response.get("results", [])
                if not documents:
                    break

                SyncLogEntry.debug(
                    sync_history,
                    f"Processing batch {batch_number} ({len(documents)} documents, offset {offset})"
                )

                for doc_summary in documents:
                    # Handle nested meta structure from Affinda API
                    # Documents may have data in top-level or nested under 'meta' key
                    meta = doc_summary.get("meta", {})
                    doc_identifier = meta.get("identifier") or doc_summary.get("identifier", "unknown")

                    logger.debug(f"Processing document: identifier={doc_identifier}, has_meta={bool(meta)}")

                    try:
                        existing = Document.objects.filter(
                            identifier=doc_identifier
                        ).exists()

                        # Fetch full document data (include_data is deprecated)
                        logger.debug(f"Fetching full document data for {doc_identifier}")
                        doc_data = client.get_document(identifier=doc_identifier)

                        document = _create_or_update_document(doc_data)
                        if document:
                            sync_document_field_values(document)
                            total_synced += 1

                            if existing:
                                documents_updated += 1
                            else:
                                documents_created += 1
                                SyncLogEntry.debug(
                                    sync_history,
                                    f"Created new document",
                                    document_identifier=doc_identifier
                                )
                        else:
                            documents_failed += 1
                            SyncLogEntry.warning(
                                sync_history,
                                f"Failed to process document (no data returned)",
                                document_identifier=doc_identifier
                            )

                    except Exception as e:
                        logger.error(f"Failed to sync document {doc_identifier}: {e}")
                        documents_failed += 1
                        SyncLogEntry.error(
                            sync_history,
                            f"Failed to sync document: {str(e)}",
                            document_identifier=doc_identifier,
                            details={"exception_type": type(e).__name__, "exception_message": str(e)}
                        )

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

        summary_msg = (
            f"Full collection sync completed: "
            f"{documents_created} created, {documents_updated} updated, "
            f"{documents_failed} failed"
        )
        logger.info(f"{summary_msg} for {collection.name}")
        SyncLogEntry.info(sync_history, summary_msg)

    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        logger.exception(f"Full collection sync failed for {collection.name}: {e}")
        sync_history.status = SyncHistory.STATUS_FAILED
        sync_history.success = False
        sync_history.error_message = str(e)
        sync_history.completed_at = timezone.now()
        sync_history.save()
        SyncLogEntry.error(
            sync_history,
            f"Sync failed: {str(e)}",
            details={"exception_type": type(e).__name__, "traceback": error_traceback}
        )

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
    collection_info = f" for collection {collection_id}" if collection_id else " (all collections)"
    SyncLogEntry.info(sync_history, f"Starting selective document sync{collection_info}")

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
    SyncLogEntry.info(sync_history, f"Found {total_count} documents with sync_enabled=True")

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
                            SyncLogEntry.warning(
                                sync_history,
                                "Failed to process document (no data returned)",
                                document_identifier=identifier
                            )
                    else:
                        documents_failed += 1
                        SyncLogEntry.warning(
                            sync_history,
                            "Document not found in Affinda API",
                            document_identifier=identifier
                        )

                except Exception as e:
                    logger.error(f"Failed to sync document {identifier}: {e}")
                    documents_failed += 1
                    SyncLogEntry.error(
                        sync_history,
                        f"Failed to sync document: {str(e)}",
                        document_identifier=identifier,
                        details={"exception_type": type(e).__name__, "exception_message": str(e)}
                    )

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

        summary_msg = f"Selective sync completed: {documents_updated} updated, {documents_failed} failed"
        logger.info(summary_msg)
        SyncLogEntry.info(sync_history, summary_msg)

    except Exception as e:
        import traceback
        error_traceback = traceback.format_exc()
        logger.exception(f"Selective sync failed: {e}")
        sync_history.status = SyncHistory.STATUS_FAILED
        sync_history.success = False
        sync_history.error_message = str(e)
        sync_history.completed_at = timezone.now()
        sync_history.save()
        SyncLogEntry.error(
            sync_history,
            f"Sync failed: {str(e)}",
            details={"exception_type": type(e).__name__, "traceback": error_traceback}
        )

    return total_synced


def _normalize_document_data(doc_data: dict) -> dict:
    """
    Normalize document data from Affinda API.

    The Affinda API returns documents with data nested under a 'meta' key.
    This function extracts and flattens the data for easier processing.

    Args:
        doc_data: Raw document data from Affinda API

    Returns:
        Normalized document dictionary with fields at top level
    """
    # If data has 'meta' key, extract fields from there
    meta = doc_data.get("meta", {})
    if meta:
        # Start with meta data as the base
        normalized = dict(meta)
        # Add any top-level fields that aren't in meta
        for key, value in doc_data.items():
            if key not in ("meta", "error", "warnings") and key not in normalized:
                normalized[key] = value
        # Preserve the original 'data' field if present in meta
        if "data" not in normalized and "data" in doc_data:
            normalized["data"] = doc_data["data"]
        # Store the full original response for reference
        normalized["_raw"] = doc_data
        return normalized
    # If no meta key, return as-is with _raw reference
    result = dict(doc_data)
    result["_raw"] = doc_data
    return result


def _create_or_update_document(doc_data: dict) -> Optional[Document]:
    """
    Create or update a Document from Affinda API response data.

    Args:
        doc_data: Document data from Affinda API

    Returns:
        The created/updated Document, or None if failed
    """
    # Normalize the document data structure
    normalized = _normalize_document_data(doc_data)

    identifier = normalized.get("identifier")
    if not identifier:
        logger.warning("Document data missing identifier")
        return None

    try:
        # Find workspace and collection
        workspace = None
        collection = None

        workspace_data = normalized.get("workspace")
        if workspace_data:
            from affinda_bridge.models import Workspace
            workspace_id = workspace_data.get("identifier") if isinstance(workspace_data, dict) else workspace_data
            if workspace_id:
                workspace = Workspace.objects.filter(identifier=workspace_id).first()

        # Check both collection and document_type fields
        collection_data = normalized.get("collection") or normalized.get("document_type")
        if collection_data:
            collection_id = collection_data.get("identifier") if isinstance(collection_data, dict) else collection_data
            if collection_id:
                collection = Collection.objects.filter(identifier=collection_id).first()

        with transaction.atomic():
            document, created = Document.objects.update_or_create(
                identifier=identifier,
                defaults={
                    "custom_identifier": normalized.get("custom_identifier", "") or normalized.get("customIdentifier", "") or "",
                    "file_name": normalized.get("file_name", "") or normalized.get("fileName", "") or "",
                    "file_url": normalized.get("file_url", "") or normalized.get("fileUrl", "") or "",
                    "review_url": normalized.get("review_url", "") or normalized.get("reviewUrl", "") or "",
                    "workspace": workspace,
                    "collection": collection,
                    "state": normalized.get("state", "") or "",
                    "is_confirmed": normalized.get("is_confirmed", False) or normalized.get("isConfirmed", False) or False,
                    "in_review": normalized.get("in_review", False) or normalized.get("inReview", False) or False,
                    "failed": normalized.get("failed", False) or False,
                    "ready": normalized.get("ready", False) or False,
                    "validatable": normalized.get("validatable", False) or False,
                    "has_challenges": normalized.get("has_challenges", False) or normalized.get("hasChallenges", False) or False,
                    "data": normalized.get("data", {}) or {},
                    "meta": doc_data.get("meta", {}) or {},  # Store original meta
                    "tags": normalized.get("tags", []) or [],
                    "raw": normalized.get("_raw", doc_data),  # Store original response
                    "last_updated_dt": timezone.now(),
                },
            )

            # Parse dates if present
            created_dt = normalized.get("created_dt") or normalized.get("createdDt")
            if created_dt:
                try:
                    from django.utils.dateparse import parse_datetime
                    parsed = parse_datetime(created_dt)
                    if parsed:
                        document.created_dt = parsed
                except Exception:
                    pass

            uploaded_dt = normalized.get("uploaded_dt") or normalized.get("uploadedDt")
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
