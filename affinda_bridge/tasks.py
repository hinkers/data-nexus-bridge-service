"""
Background task runners for long-running sync operations.
Uses Python threading to run tasks in the background without blocking the request.
"""

import logging
import threading
from typing import Optional

logger = logging.getLogger(__name__)


def run_full_collection_sync(collection_id: int, sync_history_id: int) -> None:
    """
    Run a full collection sync in a background thread.

    Args:
        collection_id: ID of the Collection to sync
        sync_history_id: ID of the SyncHistory record to update
    """
    def _run():
        try:
            from django import db
            # Close any existing database connections to avoid threading issues
            db.connections.close_all()

            from affinda_bridge.models import Collection, SyncHistory
            from affinda_bridge.services import full_collection_sync

            collection = Collection.objects.get(id=collection_id)
            sync_history = SyncHistory.objects.get(id=sync_history_id)

            full_collection_sync(collection, sync_history)

        except Exception as e:
            logger.exception(f"Background full collection sync failed: {e}")
            try:
                from django.utils import timezone
                from affinda_bridge.models import SyncHistory

                sync_history = SyncHistory.objects.get(id=sync_history_id)
                sync_history.status = SyncHistory.STATUS_FAILED
                sync_history.success = False
                sync_history.error_message = str(e)
                sync_history.completed_at = timezone.now()
                sync_history.save()
            except Exception:
                pass

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    logger.info(f"Started background full collection sync for collection {collection_id}")


def run_selective_sync(
    sync_history_id: int,
    collection_id: Optional[int] = None,
) -> None:
    """
    Run a selective sync in a background thread.

    Args:
        sync_history_id: ID of the SyncHistory record to update
        collection_id: Optional ID of the Collection to filter by
    """
    def _run():
        try:
            from django import db
            # Close any existing database connections to avoid threading issues
            db.connections.close_all()

            from affinda_bridge.models import SyncHistory
            from affinda_bridge.services import selective_document_sync

            sync_history = SyncHistory.objects.get(id=sync_history_id)

            selective_document_sync(sync_history, collection_id=collection_id)

        except Exception as e:
            logger.exception(f"Background selective sync failed: {e}")
            try:
                from django.utils import timezone
                from affinda_bridge.models import SyncHistory

                sync_history = SyncHistory.objects.get(id=sync_history_id)
                sync_history.status = SyncHistory.STATUS_FAILED
                sync_history.success = False
                sync_history.error_message = str(e)
                sync_history.completed_at = timezone.now()
                sync_history.save()
            except Exception:
                pass

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    logger.info(f"Started background selective sync (collection: {collection_id})")
