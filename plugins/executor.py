"""
Plugin executor for running plugin instances.

Handles the execution of importers, pre-processors, and post-processors.
"""
import logging
from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

from plugins.helpers import AffindaDocumentHelper, AffindaUploadHelper
from plugins.models import PluginComponent, PluginExecutionLog, PluginInstance
from plugins.registry import plugin_registry

if TYPE_CHECKING:
    from affinda_bridge.models import Document
    from plugins.base import ImportResult, PostProcessResult, PreProcessResult

logger = logging.getLogger(__name__)


def execute_importer(instance: PluginInstance) -> list["ImportResult"]:
    """
    Execute an importer instance.

    Args:
        instance: The PluginInstance to execute

    Returns:
        List of ImportResult objects
    """
    from plugins.base import ImportResult

    if instance.component.component_type != PluginComponent.COMPONENT_TYPE_IMPORTER:
        raise ValueError(f"Instance {instance.name} is not an importer")

    if not instance.enabled:
        logger.info(f"Skipping disabled importer: {instance.name}")
        return []

    # Get the importer class from registry
    full_slug = f"{instance.component.plugin.slug}.{instance.component.slug}"
    importer_class = plugin_registry.get_importer(full_slug)

    if not importer_class:
        logger.error(f"Importer class not found: {full_slug}")
        return [ImportResult(success=False, message=f"Importer class not found: {full_slug}")]

    # Create execution log
    log = PluginExecutionLog.objects.create(
        instance=instance,
        status=PluginExecutionLog.STATUS_STARTED,
        input_data={'config': instance.config},
    )

    results = []
    try:
        # Initialize the importer with helpers
        with AffindaUploadHelper() as upload_helper:
            importer = importer_class(
                plugin_config=instance.component.plugin.config,
                instance_config=instance.config,
                upload_helper=upload_helper,
            )

            # Validate config
            errors = importer.validate_config()
            if errors:
                raise ValueError(f"Configuration errors: {', '.join(errors)}")

            # Run the importer
            results = importer.run()

        # Update log with success
        log.status = PluginExecutionLog.STATUS_SUCCESS
        log.completed_at = timezone.now()
        log.output_data = {
            'results': [
                {
                    'success': r.success,
                    'document_identifier': r.document_identifier,
                    'file_name': r.file_name,
                    'message': r.message,
                }
                for r in results
            ]
        }
        log.save()

        logger.info(f"Importer {instance.name} completed: {len(results)} results")

    except Exception as e:
        log.status = PluginExecutionLog.STATUS_FAILED
        log.completed_at = timezone.now()
        log.error_message = str(e)
        log.save()

        logger.error(f"Importer {instance.name} failed: {e}")
        results = [ImportResult(success=False, message=str(e))]

    return results


def execute_preprocessor(instance: PluginInstance, document: "Document") -> "PreProcessResult":
    """
    Execute a pre-processor instance on a document.

    Args:
        instance: The PluginInstance to execute
        document: The document to pre-process

    Returns:
        PreProcessResult with any modifications
    """
    from plugins.base import PreProcessResult

    if instance.component.component_type != PluginComponent.COMPONENT_TYPE_PREPROCESSOR:
        raise ValueError(f"Instance {instance.name} is not a pre-processor")

    if not instance.enabled:
        return PreProcessResult(success=True, message="Pre-processor disabled")

    # Check collection filter
    if instance.collections.exists() and document.collection:
        if document.collection not in instance.collections.all():
            return PreProcessResult(success=True, message="Document not in configured collections")

    # Get the pre-processor class from registry
    full_slug = f"{instance.component.plugin.slug}.{instance.component.slug}"
    preprocessor_class = plugin_registry.get_preprocessor(full_slug)

    if not preprocessor_class:
        logger.error(f"Pre-processor class not found: {full_slug}")
        return PreProcessResult(success=False, message=f"Class not found: {full_slug}")

    # Create execution log
    log = PluginExecutionLog.objects.create(
        instance=instance,
        document=document,
        status=PluginExecutionLog.STATUS_STARTED,
        input_data={
            'document_identifier': document.identifier,
            'file_name': document.file_name,
            'custom_identifier': document.custom_identifier,
        },
    )

    try:
        # Initialize the pre-processor
        preprocessor = preprocessor_class(
            plugin_config=instance.component.plugin.config,
            instance_config=instance.config,
        )

        # Validate config
        errors = preprocessor.validate_config()
        if errors:
            raise ValueError(f"Configuration errors: {', '.join(errors)}")

        # Run the pre-processor
        result = preprocessor.process(document)

        # Update log
        log.status = PluginExecutionLog.STATUS_SUCCESS
        log.completed_at = timezone.now()
        log.output_data = {
            'success': result.success,
            'new_file_name': result.new_file_name,
            'new_custom_identifier': result.new_custom_identifier,
            'abort': result.abort,
            'message': result.message,
        }
        log.save()

        logger.info(f"Pre-processor {instance.name} completed for document {document.identifier}")
        return result

    except Exception as e:
        log.status = PluginExecutionLog.STATUS_FAILED
        log.completed_at = timezone.now()
        log.error_message = str(e)
        log.save()

        logger.error(f"Pre-processor {instance.name} failed: {e}")
        return PreProcessResult(success=False, message=str(e))


def execute_postprocessor(instance: PluginInstance, document: "Document", event: str) -> "PostProcessResult":
    """
    Execute a post-processor instance on a document.

    Args:
        instance: The PluginInstance to execute
        document: The document to post-process
        event: The event that triggered this execution

    Returns:
        PostProcessResult with any actions
    """
    from plugins.base import PostProcessResult

    if instance.component.component_type != PluginComponent.COMPONENT_TYPE_POSTPROCESSOR:
        raise ValueError(f"Instance {instance.name} is not a post-processor")

    if not instance.enabled:
        return PostProcessResult(success=True, message="Post-processor disabled")

    # Check if this instance handles this event
    if instance.event_triggers and event not in instance.event_triggers:
        return PostProcessResult(success=True, message=f"Event {event} not in triggers")

    # Check collection filter
    if instance.collections.exists() and document.collection:
        if document.collection not in instance.collections.all():
            return PostProcessResult(success=True, message="Document not in configured collections")

    # Get the post-processor class from registry
    full_slug = f"{instance.component.plugin.slug}.{instance.component.slug}"
    postprocessor_class = plugin_registry.get_postprocessor(full_slug)

    if not postprocessor_class:
        logger.error(f"Post-processor class not found: {full_slug}")
        return PostProcessResult(success=False, message=f"Class not found: {full_slug}")

    # Create execution log
    log = PluginExecutionLog.objects.create(
        instance=instance,
        document=document,
        event_type=event,
        status=PluginExecutionLog.STATUS_STARTED,
        input_data={
            'document_identifier': document.identifier,
            'event': event,
        },
    )

    try:
        # Initialize the post-processor with helper
        with AffindaDocumentHelper() as doc_helper:
            postprocessor = postprocessor_class(
                plugin_config=instance.component.plugin.config,
                instance_config=instance.config,
                affinda_helper=doc_helper,
            )

            # Validate config
            errors = postprocessor.validate_config()
            if errors:
                raise ValueError(f"Configuration errors: {', '.join(errors)}")

            # Run the post-processor
            result = postprocessor.process(document, event)

            # Apply actions if requested
            if result.archive_document:
                doc_helper.archive(document.identifier)

            if result.new_custom_identifier:
                doc_helper.update_custom_identifier(
                    document.identifier,
                    result.new_custom_identifier
                )

            if result.new_file_name:
                doc_helper.rename(document.identifier, result.new_file_name)

        # Update log
        log.status = PluginExecutionLog.STATUS_SUCCESS
        log.completed_at = timezone.now()
        log.output_data = {
            'success': result.success,
            'archive_document': result.archive_document,
            'new_custom_identifier': result.new_custom_identifier,
            'new_file_name': result.new_file_name,
            'message': result.message,
        }
        log.save()

        logger.info(f"Post-processor {instance.name} completed for document {document.identifier}")
        return result

    except Exception as e:
        log.status = PluginExecutionLog.STATUS_FAILED
        log.completed_at = timezone.now()
        log.error_message = str(e)
        log.save()

        logger.error(f"Post-processor {instance.name} failed: {e}")
        return PostProcessResult(success=False, message=str(e))


def execute_postprocessors(document: "Document", event: str) -> list["PostProcessResult"]:
    """
    Execute all enabled post-processors for a given event.

    Args:
        document: The document to process
        event: The event type

    Returns:
        List of PostProcessResult objects
    """
    from plugins.base import PostProcessResult

    results = []

    # Get all enabled post-processor instances that handle this event
    instances = PluginInstance.objects.filter(
        enabled=True,
        component__component_type=PluginComponent.COMPONENT_TYPE_POSTPROCESSOR,
        component__plugin__enabled=True,
    ).select_related('component', 'component__plugin').order_by('priority')

    for instance in instances:
        # Check if this instance handles this event
        if instance.event_triggers and event not in instance.event_triggers:
            continue

        try:
            result = execute_postprocessor(instance, document, event)
            results.append(result)
        except Exception as e:
            logger.error(f"Error executing post-processor {instance.name}: {e}")
            results.append(PostProcessResult(success=False, message=str(e)))

    return results


def execute_preprocessors(document: "Document") -> list["PreProcessResult"]:
    """
    Execute all enabled pre-processors on a document.

    Args:
        document: The document to process

    Returns:
        List of PreProcessResult objects
    """
    from plugins.base import PreProcessResult

    results = []

    # Get all enabled pre-processor instances
    instances = PluginInstance.objects.filter(
        enabled=True,
        component__component_type=PluginComponent.COMPONENT_TYPE_PREPROCESSOR,
        component__plugin__enabled=True,
    ).select_related('component', 'component__plugin').order_by('priority')

    for instance in instances:
        try:
            result = execute_preprocessor(instance, document)
            results.append(result)

            # If abort is requested, stop processing
            if result.abort:
                logger.info(f"Pre-processor {instance.name} requested abort")
                break

        except Exception as e:
            logger.error(f"Error executing pre-processor {instance.name}: {e}")
            results.append(PreProcessResult(success=False, message=str(e)))

    return results
