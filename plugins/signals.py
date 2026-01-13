"""
Django signals for plugin events.

These signals are emitted when document events occur, allowing post-processors
to respond to changes.
"""
import logging

from django.db.models.signals import post_save, pre_save
from django.dispatch import Signal, receiver

from affinda_bridge.models import Document

logger = logging.getLogger(__name__)


# Custom signals for document lifecycle events
document_uploaded = Signal()  # Sent when a new document is uploaded
document_approved = Signal()  # Sent when a document is confirmed/approved
document_rejected = Signal()  # Sent when a document is rejected
document_archived = Signal()  # Sent when a document is archived
document_updated = Signal()   # Sent when document data is updated


@receiver(pre_save, sender=Document)
def track_document_changes(sender, instance: Document, **kwargs):
    """
    Track changes to documents before saving.

    This allows us to detect state changes and emit the appropriate signals.
    """
    if instance.pk:
        try:
            old_instance = Document.objects.get(pk=instance.pk)
            instance._old_state = old_instance.state
            instance._old_is_confirmed = old_instance.is_confirmed
        except Document.DoesNotExist:
            instance._old_state = None
            instance._old_is_confirmed = None
    else:
        instance._old_state = None
        instance._old_is_confirmed = None


@receiver(post_save, sender=Document)
def emit_document_signals(sender, instance: Document, created: bool, **kwargs):
    """
    Emit signals based on document changes.
    """
    from plugins.executor import execute_postprocessors

    old_state = getattr(instance, '_old_state', None)
    old_is_confirmed = getattr(instance, '_old_is_confirmed', None)

    if created:
        # New document uploaded
        logger.debug(f"Document uploaded: {instance.identifier}")
        document_uploaded.send(sender=Document, document=instance)
        execute_postprocessors(instance, 'document_uploaded')
        return

    # Check for state changes
    new_state = instance.state
    new_is_confirmed = instance.is_confirmed

    # Document was approved (confirmed)
    if new_is_confirmed and not old_is_confirmed:
        logger.debug(f"Document approved: {instance.identifier}")
        document_approved.send(sender=Document, document=instance)
        execute_postprocessors(instance, 'document_approved')

    # Document was archived
    if new_state == Document.STATE_ARCHIVED and old_state != Document.STATE_ARCHIVED:
        logger.debug(f"Document archived: {instance.identifier}")
        document_archived.send(sender=Document, document=instance)
        execute_postprocessors(instance, 'document_archived')

    # Document was rejected (failed state or similar)
    if instance.failed and not getattr(instance, '_old_failed', False):
        logger.debug(f"Document rejected: {instance.identifier}")
        document_rejected.send(sender=Document, document=instance)
        execute_postprocessors(instance, 'document_rejected')

    # Generic update (data changed)
    if not created:
        document_updated.send(sender=Document, document=instance)
        execute_postprocessors(instance, 'document_updated')
