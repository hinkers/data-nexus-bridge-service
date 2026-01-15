"""
Service for syncing DocumentFieldValue from Document.data JSON.
"""

import logging
from typing import TYPE_CHECKING

from django.db import transaction

if TYPE_CHECKING:
    from affinda_bridge.models import Document

logger = logging.getLogger(__name__)


def sync_document_field_values(document: "Document") -> int:
    """
    Extract field values from document.data JSON and create DocumentFieldValue records.

    Args:
        document: Document to sync field values for

    Returns:
        Number of field values synced
    """
    from affinda_bridge.models import DocumentFieldValue, FieldDefinition

    if not document.collection:
        logger.warning(
            f"Document {document.identifier} has no collection, skipping field sync"
        )
        return 0

    # Get field definitions for this collection
    field_definitions = FieldDefinition.objects.filter(collection=document.collection)
    field_map = {fd.datapoint_identifier: fd for fd in field_definitions}

    data = document.data or {}
    synced_count = 0

    with transaction.atomic():
        for datapoint_id, value in data.items():
            field_def = field_map.get(datapoint_id)
            if not field_def:
                continue

            # Convert value to string for storage
            if isinstance(value, dict):
                # Complex type - store parsed value if available
                str_value = value.get("parsed") or value.get("value") or str(value)
                raw_value = value
            elif isinstance(value, list):
                str_value = ", ".join(str(v) for v in value)
                raw_value = {"list": value}
            elif value is None:
                str_value = None
                raw_value = {}
            else:
                str_value = str(value)
                raw_value = {"value": value}

            DocumentFieldValue.objects.update_or_create(
                document=document,
                field_definition=field_def,
                defaults={
                    "value": str_value,
                    "raw_value": raw_value,
                },
            )
            synced_count += 1

    logger.debug(f"Synced {synced_count} field values for document {document.identifier}")
    return synced_count


def sync_collection_field_values(collection_id: int) -> int:
    """
    Sync field values for all documents in a collection.

    Args:
        collection_id: ID of the collection to sync

    Returns:
        Total number of field values synced
    """
    from affinda_bridge.models import Collection, Document

    collection = Collection.objects.get(id=collection_id)
    documents = Document.objects.filter(collection=collection)

    total_synced = 0
    for document in documents:
        total_synced += sync_document_field_values(document)

    logger.info(
        f"Synced {total_synced} total field values for collection {collection.name}"
    )
    return total_synced
