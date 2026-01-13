"""
Example Plugin for Data Nexus Bridge

This plugin demonstrates how to create:
- An Importer (for uploading documents from a source)
- A Pre-Processor (for modifying document metadata before processing)
- A Post-Processor (for handling document events)

To use this plugin:
1. Add 'plugins.contrib.example_plugin' to PLUGIN_MODULES in settings.py
2. Restart the server
3. Install the plugin via the API or admin interface
4. Configure instances as needed
"""
import io
import logging
import re
from datetime import datetime
from typing import TYPE_CHECKING

from plugins.base import (
    BaseImporter,
    BasePlugin,
    BasePostProcessor,
    BasePreProcessor,
    ComponentMeta,
    ImportResult,
    PluginMeta,
    PostProcessResult,
    PreProcessResult,
)

if TYPE_CHECKING:
    from affinda_bridge.models import Document
    from plugins.helpers import AffindaDocumentHelper, AffindaUploadHelper

logger = logging.getLogger(__name__)


# =============================================================================
# IMPORTER: File System Importer
# =============================================================================

class FileSystemImporter(BaseImporter):
    """
    Example importer that reads files from a configured directory.

    Configuration:
    - directory: Path to the directory to scan for files
    - file_pattern: Regex pattern to match files (default: all files)
    - collection_identifier: Target Affinda collection
    - delete_after_import: Whether to delete files after import
    """

    @classmethod
    def get_meta(cls) -> ComponentMeta:
        return ComponentMeta(
            slug="filesystem-importer",
            name="File System Importer",
            description="Import documents from a local directory",
            config_schema={
                "type": "object",
                "properties": {
                    "directory": {
                        "type": "string",
                        "description": "Directory path to scan for files",
                    },
                    "file_pattern": {
                        "type": "string",
                        "description": "Regex pattern to match files",
                        "default": ".*\\.(pdf|png|jpg|jpeg|tiff)$",
                    },
                    "collection_identifier": {
                        "type": "string",
                        "description": "Target Affinda collection identifier",
                    },
                    "delete_after_import": {
                        "type": "boolean",
                        "description": "Delete files after successful import",
                        "default": False,
                    },
                },
                "required": ["directory", "collection_identifier"],
            }
        )

    def validate_config(self) -> list[str]:
        errors = []
        if not self.config.get("directory"):
            errors.append("Directory is required")
        if not self.config.get("collection_identifier"):
            errors.append("Collection identifier is required")
        return errors

    def run(self) -> list[ImportResult]:
        """
        Scan directory and upload matching files.

        Note: This is a simplified example. In production, you'd want:
        - Better error handling
        - Tracking of already-imported files
        - Batching for large directories
        """
        import os

        results = []
        directory = self.config.get("directory", "")
        pattern = self.config.get("file_pattern", r".*\.(pdf|png|jpg|jpeg|tiff)$")
        collection = self.config.get("collection_identifier", "")
        delete_after = self.config.get("delete_after_import", False)

        if not os.path.isdir(directory):
            return [ImportResult(
                success=False,
                message=f"Directory does not exist: {directory}"
            )]

        regex = re.compile(pattern, re.IGNORECASE)

        for filename in os.listdir(directory):
            filepath = os.path.join(directory, filename)

            # Skip directories and non-matching files
            if not os.path.isfile(filepath):
                continue
            if not regex.match(filename):
                continue

            try:
                # Read file and upload
                with open(filepath, 'rb') as f:
                    file_content = f.read()

                # Upload to Affinda
                response = self.upload_helper.upload(
                    file=io.BytesIO(file_content),
                    file_name=filename,
                    collection_identifier=collection,
                    wait=False,
                )

                result = ImportResult(
                    success=True,
                    document_identifier=response.get('identifier'),
                    file_name=filename,
                    message=f"Successfully uploaded {filename}",
                )
                results.append(result)

                # Delete if configured
                if delete_after:
                    os.remove(filepath)
                    logger.info(f"Deleted imported file: {filepath}")

            except Exception as e:
                logger.error(f"Failed to import {filename}: {e}")
                results.append(ImportResult(
                    success=False,
                    file_name=filename,
                    message=str(e),
                ))

        return results


# =============================================================================
# PRE-PROCESSOR: Custom Identifier Generator
# =============================================================================

class CustomIdentifierGenerator(BasePreProcessor):
    """
    Example pre-processor that generates custom identifiers for documents.

    Configuration:
    - prefix: Prefix for the custom identifier
    - include_date: Include date in the identifier
    - date_format: Date format string (default: %Y%m%d)
    """

    @classmethod
    def get_meta(cls) -> ComponentMeta:
        return ComponentMeta(
            slug="custom-id-generator",
            name="Custom Identifier Generator",
            description="Generate custom identifiers based on file name and date",
            config_schema={
                "type": "object",
                "properties": {
                    "prefix": {
                        "type": "string",
                        "description": "Prefix for the custom identifier",
                        "default": "DOC",
                    },
                    "include_date": {
                        "type": "boolean",
                        "description": "Include current date in identifier",
                        "default": True,
                    },
                    "date_format": {
                        "type": "string",
                        "description": "Date format string",
                        "default": "%Y%m%d",
                    },
                },
            }
        )

    def process(self, document: "Document") -> PreProcessResult:
        """Generate a custom identifier if one doesn't exist."""

        # Skip if already has a custom identifier
        if document.custom_identifier:
            return PreProcessResult(
                success=True,
                message="Document already has custom identifier"
            )

        prefix = self.config.get("prefix", "DOC")
        include_date = self.config.get("include_date", True)
        date_format = self.config.get("date_format", "%Y%m%d")

        # Build custom identifier
        parts = [prefix]

        if include_date:
            parts.append(datetime.now().strftime(date_format))

        # Add a sanitized version of the file name
        if document.file_name:
            # Remove extension and sanitize
            name_part = document.file_name.rsplit('.', 1)[0]
            name_part = re.sub(r'[^a-zA-Z0-9]', '-', name_part)[:20]
            parts.append(name_part)

        # Add document identifier suffix for uniqueness
        parts.append(document.identifier[-8:])

        custom_id = "-".join(parts).upper()

        logger.info(f"Generated custom identifier for {document.identifier}: {custom_id}")

        return PreProcessResult(
            success=True,
            new_custom_identifier=custom_id,
            message=f"Generated custom identifier: {custom_id}",
        )


# =============================================================================
# POST-PROCESSOR: Archive on Approval
# =============================================================================

class ArchiveOnApproval(BasePostProcessor):
    """
    Example post-processor that archives documents after approval.

    Configuration:
    - archive_delay_days: Days to wait before archiving (0 = immediate)
    - notify_email: Email to notify on archive (optional)
    """

    SUPPORTED_EVENTS = ['document_approved']

    @classmethod
    def get_meta(cls) -> ComponentMeta:
        return ComponentMeta(
            slug="archive-on-approval",
            name="Archive on Approval",
            description="Automatically archive documents after they are approved",
            config_schema={
                "type": "object",
                "properties": {
                    "archive_delay_days": {
                        "type": "integer",
                        "description": "Days to wait before archiving",
                        "default": 0,
                        "minimum": 0,
                    },
                    "add_archived_prefix": {
                        "type": "boolean",
                        "description": "Add 'ARCHIVED-' prefix to custom identifier",
                        "default": True,
                    },
                },
            }
        )

    def process(self, document: "Document", event: str) -> PostProcessResult:
        """Archive the document when approved."""

        if event != 'document_approved':
            return PostProcessResult(
                success=True,
                message=f"Event {event} not handled by this processor"
            )

        archive_delay = self.config.get("archive_delay_days", 0)
        add_prefix = self.config.get("add_archived_prefix", True)

        # For simplicity, we're ignoring the delay in this example
        # In production, you'd schedule this for later execution
        if archive_delay > 0:
            logger.info(f"Would schedule archive for {document.identifier} in {archive_delay} days")
            return PostProcessResult(
                success=True,
                message=f"Archive scheduled for {archive_delay} days from now"
            )

        # Update custom identifier if configured
        new_custom_id = None
        if add_prefix and document.custom_identifier:
            if not document.custom_identifier.startswith("ARCHIVED-"):
                new_custom_id = f"ARCHIVED-{document.custom_identifier}"

        logger.info(f"Archiving document {document.identifier}")

        return PostProcessResult(
            success=True,
            archive_document=True,
            new_custom_identifier=new_custom_id,
            message="Document archived successfully",
        )


# =============================================================================
# POST-PROCESSOR: Webhook Notifier
# =============================================================================

class WebhookNotifier(BasePostProcessor):
    """
    Example post-processor that sends webhooks on document events.

    Configuration:
    - webhook_url: URL to send the webhook to
    - include_data: Include document data in the payload
    - events: List of events to notify on
    """

    SUPPORTED_EVENTS = [
        'document_uploaded',
        'document_approved',
        'document_rejected',
        'document_archived',
    ]

    @classmethod
    def get_meta(cls) -> ComponentMeta:
        return ComponentMeta(
            slug="webhook-notifier",
            name="Webhook Notifier",
            description="Send webhook notifications on document events",
            config_schema={
                "type": "object",
                "properties": {
                    "webhook_url": {
                        "type": "string",
                        "description": "URL to send webhooks to",
                        "format": "uri",
                    },
                    "include_data": {
                        "type": "boolean",
                        "description": "Include document data in payload",
                        "default": False,
                    },
                    "secret": {
                        "type": "string",
                        "description": "Secret for webhook signature (optional)",
                    },
                },
                "required": ["webhook_url"],
            }
        )

    def validate_config(self) -> list[str]:
        errors = []
        if not self.config.get("webhook_url"):
            errors.append("Webhook URL is required")
        return errors

    def process(self, document: "Document", event: str) -> PostProcessResult:
        """Send a webhook notification."""
        import json

        import httpx

        webhook_url = self.config.get("webhook_url", "")
        include_data = self.config.get("include_data", False)

        # Build payload
        payload = {
            "event": event,
            "timestamp": datetime.now().isoformat(),
            "document": {
                "identifier": document.identifier,
                "custom_identifier": document.custom_identifier,
                "file_name": document.file_name,
                "state": document.state,
            },
        }

        if include_data and document.data:
            payload["document"]["data"] = document.data

        try:
            # In production, you'd want async/background execution
            response = httpx.post(
                webhook_url,
                json=payload,
                timeout=30,
            )
            response.raise_for_status()

            logger.info(f"Webhook sent for {document.identifier}: {event}")

            return PostProcessResult(
                success=True,
                message=f"Webhook sent: {response.status_code}",
                metadata={"response_code": response.status_code},
            )

        except Exception as e:
            logger.error(f"Webhook failed for {document.identifier}: {e}")
            return PostProcessResult(
                success=False,
                message=f"Webhook failed: {e}",
            )


# =============================================================================
# PLUGIN CLASS
# =============================================================================

class ExamplePlugin(BasePlugin):
    """
    Example plugin demonstrating all component types.

    Plugin-level config is shared across all component instances.
    Use it for things like API keys, base URLs, or shared settings.
    """

    @classmethod
    def get_meta(cls) -> PluginMeta:
        return PluginMeta(
            slug="example-plugin",
            name="Example Plugin",
            version="1.0.0",
            author="Data Nexus Bridge",
            description="Demonstrates plugin system with sample importers, pre-processors, and post-processors",
            config_schema={
                "type": "object",
                "properties": {
                    "api_key": {
                        "type": "string",
                        "title": "API Key",
                        "description": "API key for external service integration (shared across all instances)",
                    },
                    "api_base_url": {
                        "type": "string",
                        "title": "API Base URL",
                        "description": "Base URL for external API calls",
                        "default": "https://api.example.com",
                    },
                    "debug_mode": {
                        "type": "boolean",
                        "title": "Debug Mode",
                        "description": "Enable verbose debug logging for all components",
                        "default": False,
                    },
                },
            }
        )

    @classmethod
    def get_importers(cls) -> list[type[BaseImporter]]:
        return [FileSystemImporter]

    @classmethod
    def get_preprocessors(cls) -> list[type[BasePreProcessor]]:
        return [CustomIdentifierGenerator]

    @classmethod
    def get_postprocessors(cls) -> list[type[BasePostProcessor]]:
        return [ArchiveOnApproval, WebhookNotifier]
