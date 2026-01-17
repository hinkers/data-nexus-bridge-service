"""
Webhook receiver endpoints for Affinda document events.
"""

import json
import logging

from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from affinda_bridge.models import WebhookConfiguration, WebhookLog
from affinda_bridge.services import sync_single_document

logger = logging.getLogger(__name__)


@csrf_exempt
@require_POST
def webhook_receiver(request, secret_token: str):
    """
    Receive and process webhook events from Affinda.

    URL: POST /api/webhooks/affinda/<secret_token>/

    The webhook is authenticated via the secret token in the URL.
    """
    # Validate the secret token
    try:
        config = WebhookConfiguration.get_config()
    except Exception as e:
        logger.error(f"Failed to get webhook config: {e}")
        return JsonResponse({"error": "Internal error"}, status=500)

    if secret_token != config.secret_token:
        logger.warning(f"Invalid webhook token received")
        return JsonResponse({"error": "Invalid token"}, status=403)

    # Check if webhooks are enabled
    if not config.enabled:
        logger.info("Webhook received but webhooks are disabled")
        return JsonResponse({"status": "ignored", "reason": "Webhooks disabled"})

    # Parse the payload
    try:
        payload = json.loads(request.body)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse webhook payload: {e}")
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    # Extract event information
    event_type = payload.get("event") or payload.get("type") or payload.get("event_type", "")
    document_data = payload.get("document", {})
    document_identifier = document_data.get("identifier", "") if isinstance(document_data, dict) else ""

    # Create log entry
    webhook_log = WebhookLog.objects.create(
        event_type=event_type,
        document_identifier=document_identifier,
        payload=payload,
        status=WebhookLog.STATUS_RECEIVED,
    )

    # Check if this event type is enabled
    if not config.is_event_enabled(event_type):
        logger.info(f"Webhook event '{event_type}' is not enabled, ignoring")
        webhook_log.status = WebhookLog.STATUS_IGNORED
        webhook_log.error_message = f"Event type '{event_type}' is not enabled"
        webhook_log.save(update_fields=["status", "error_message"])
        return JsonResponse({"status": "ignored", "reason": "Event type not enabled"})

    # Process the webhook
    try:
        if document_identifier:
            logger.info(f"Processing webhook for document {document_identifier}")
            document = sync_single_document(document_identifier)

            if document:
                webhook_log.status = WebhookLog.STATUS_PROCESSED
                webhook_log.processed_at = timezone.now()
                webhook_log.save(update_fields=["status", "processed_at"])

                logger.info(f"Webhook processed successfully for document {document_identifier}")
                return JsonResponse({
                    "status": "processed",
                    "document_id": document.id,
                    "document_identifier": document.identifier,
                })
            else:
                webhook_log.status = WebhookLog.STATUS_FAILED
                webhook_log.error_message = "Failed to sync document"
                webhook_log.processed_at = timezone.now()
                webhook_log.save(update_fields=["status", "error_message", "processed_at"])

                return JsonResponse({
                    "status": "failed",
                    "error": "Failed to sync document",
                }, status=500)
        else:
            # No document identifier, just acknowledge
            webhook_log.status = WebhookLog.STATUS_PROCESSED
            webhook_log.processed_at = timezone.now()
            webhook_log.error_message = "No document identifier in payload"
            webhook_log.save(update_fields=["status", "processed_at", "error_message"])

            return JsonResponse({
                "status": "processed",
                "note": "No document identifier in payload",
            })

    except Exception as e:
        logger.exception(f"Failed to process webhook: {e}")
        webhook_log.status = WebhookLog.STATUS_FAILED
        webhook_log.error_message = str(e)
        webhook_log.processed_at = timezone.now()
        webhook_log.save(update_fields=["status", "error_message", "processed_at"])

        return JsonResponse({
            "status": "failed",
            "error": str(e),
        }, status=500)
