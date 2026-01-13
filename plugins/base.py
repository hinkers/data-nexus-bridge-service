"""
Abstract base classes for plugin components.

Plugins extend these classes to implement custom importers, pre-processors, and post-processors.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, BinaryIO

from affinda_bridge.models import Document


@dataclass
class PluginMeta:
    """Metadata for a plugin."""
    slug: str
    name: str
    version: str
    author: str = ""
    description: str = ""
    config_schema: dict = field(default_factory=dict)


@dataclass
class ComponentMeta:
    """Metadata for a plugin component."""
    slug: str
    name: str
    description: str = ""
    config_schema: dict = field(default_factory=dict)


@dataclass
class ImportResult:
    """Result of an import operation."""
    success: bool
    document_identifier: str | None = None
    file_name: str | None = None
    custom_identifier: str | None = None
    message: str = ""
    metadata: dict = field(default_factory=dict)


@dataclass
class PreProcessResult:
    """Result of a pre-processing operation."""
    success: bool
    # Optional modifications to the document
    new_file_name: str | None = None
    new_custom_identifier: str | None = None
    metadata: dict = field(default_factory=dict)
    message: str = ""
    # If True, abort further processing
    abort: bool = False


@dataclass
class PostProcessResult:
    """Result of a post-processing operation."""
    success: bool
    # Actions to perform
    archive_document: bool = False
    new_custom_identifier: str | None = None
    new_file_name: str | None = None
    metadata: dict = field(default_factory=dict)
    message: str = ""


class BasePlugin(ABC):
    """
    Base class for all plugins.

    Plugins should subclass this and register their components in the `register` method.
    """

    @classmethod
    @abstractmethod
    def get_meta(cls) -> PluginMeta:
        """Return plugin metadata."""
        pass

    @classmethod
    def get_importers(cls) -> list[type["BaseImporter"]]:
        """Return list of importer classes provided by this plugin."""
        return []

    @classmethod
    def get_preprocessors(cls) -> list[type["BasePreProcessor"]]:
        """Return list of pre-processor classes provided by this plugin."""
        return []

    @classmethod
    def get_postprocessors(cls) -> list[type["BasePostProcessor"]]:
        """Return list of post-processor classes provided by this plugin."""
        return []

    def __init__(self, config: dict | None = None):
        """
        Initialize the plugin with its global configuration.

        Args:
            config: Plugin-level configuration values
        """
        self.config = config or {}

    def validate_config(self) -> list[str]:
        """
        Validate the plugin configuration.

        Returns:
            List of validation error messages (empty if valid)
        """
        return []


class BaseImporter(ABC):
    """
    Base class for importers.

    Importers are responsible for uploading documents to Affinda from various sources.
    They receive file streams and send them to Affinda using the provided upload helper.
    """

    @classmethod
    @abstractmethod
    def get_meta(cls) -> ComponentMeta:
        """Return component metadata."""
        pass

    def __init__(self, plugin_config: dict, instance_config: dict, upload_helper: "AffindaUploadHelper"):
        """
        Initialize the importer.

        Args:
            plugin_config: Plugin-level configuration
            instance_config: Instance-specific configuration
            upload_helper: Helper for uploading files to Affinda
        """
        self.plugin_config = plugin_config
        self.config = instance_config
        self.upload_helper = upload_helper

    def validate_config(self) -> list[str]:
        """Validate the instance configuration."""
        return []

    @abstractmethod
    def run(self) -> list[ImportResult]:
        """
        Execute the import operation.

        This method should:
        1. Fetch files from the source (email, FTP, API, etc.)
        2. For each file, call self.upload_helper.upload() to send to Affinda
        3. Return a list of ImportResult objects

        Returns:
            List of import results
        """
        pass


class BasePreProcessor(ABC):
    """
    Base class for pre-processors.

    Pre-processors run after a document is uploaded but before it's fully processed.
    They can modify document metadata like file name and custom identifier.
    """

    @classmethod
    @abstractmethod
    def get_meta(cls) -> ComponentMeta:
        """Return component metadata."""
        pass

    def __init__(self, plugin_config: dict, instance_config: dict):
        """
        Initialize the pre-processor.

        Args:
            plugin_config: Plugin-level configuration
            instance_config: Instance-specific configuration
        """
        self.plugin_config = plugin_config
        self.config = instance_config

    def validate_config(self) -> list[str]:
        """Validate the instance configuration."""
        return []

    @abstractmethod
    def process(self, document: Document) -> PreProcessResult:
        """
        Process a document before full Affinda processing.

        Args:
            document: The document to pre-process (has identifier, file_name, custom_identifier)

        Returns:
            PreProcessResult with any modifications to apply
        """
        pass


class BasePostProcessor(ABC):
    """
    Base class for post-processors.

    Post-processors run in response to document events (approved, rejected, archived, etc.).
    They have access to the full document data and can perform actions like archiving.
    """

    # Events this post-processor can handle
    SUPPORTED_EVENTS: list[str] = []

    @classmethod
    @abstractmethod
    def get_meta(cls) -> ComponentMeta:
        """Return component metadata."""
        pass

    @classmethod
    def get_supported_events(cls) -> list[str]:
        """Return list of events this post-processor can handle."""
        return cls.SUPPORTED_EVENTS

    def __init__(self, plugin_config: dict, instance_config: dict, affinda_helper: "AffindaDocumentHelper"):
        """
        Initialize the post-processor.

        Args:
            plugin_config: Plugin-level configuration
            instance_config: Instance-specific configuration
            affinda_helper: Helper for interacting with Affinda (archive, update, etc.)
        """
        self.plugin_config = plugin_config
        self.config = instance_config
        self.affinda_helper = affinda_helper

    def validate_config(self) -> list[str]:
        """Validate the instance configuration."""
        return []

    @abstractmethod
    def process(self, document: Document, event: str) -> PostProcessResult:
        """
        Process a document in response to an event.

        Args:
            document: The document with full data
            event: The event that triggered this processor

        Returns:
            PostProcessResult with any actions to perform
        """
        pass


# Type hints for helpers (defined in helpers.py)
class AffindaUploadHelper:
    """Helper for uploading files to Affinda."""

    def upload(
        self,
        file: BinaryIO,
        file_name: str,
        collection_identifier: str,
        custom_identifier: str | None = None,
        wait: bool = False,
        metadata: dict | None = None,
    ) -> dict:
        """
        Upload a file to Affinda.

        Args:
            file: File-like object to upload
            file_name: Name of the file
            collection_identifier: Target collection identifier
            custom_identifier: Optional custom identifier
            wait: Whether to wait for processing (default False)
            metadata: Optional metadata to attach

        Returns:
            Affinda API response with document identifier
        """
        raise NotImplementedError


class AffindaDocumentHelper:
    """Helper for interacting with Affinda documents."""

    def archive(self, document_identifier: str) -> bool:
        """Archive a document in Affinda."""
        raise NotImplementedError

    def update_custom_identifier(self, document_identifier: str, custom_identifier: str) -> bool:
        """Update a document's custom identifier."""
        raise NotImplementedError

    def rename(self, document_identifier: str, new_file_name: str) -> bool:
        """Rename a document."""
        raise NotImplementedError

    def get_document(self, document_identifier: str) -> dict:
        """Get full document data from Affinda."""
        raise NotImplementedError
