"""
Helper classes for plugins to interact with Affinda.
"""
import logging
from typing import Any, BinaryIO

from affinda_bridge.clients import AffindaClient

logger = logging.getLogger(__name__)


class AffindaUploadHelper:
    """
    Helper for uploading files to Affinda.

    Used by importers to send documents to Affinda for processing.
    """

    def __init__(self, client: AffindaClient | None = None):
        """
        Initialize the upload helper.

        Args:
            client: Optional existing Affinda client. If not provided, creates a new one.
        """
        self._client = client
        self._owns_client = client is None

    def __enter__(self) -> "AffindaUploadHelper":
        if self._client is None:
            self._client = AffindaClient()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._owns_client and self._client:
            self._client.close()

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
            custom_identifier: Optional custom identifier for the document
            wait: Whether to wait for processing to complete (default False for async)
            metadata: Optional metadata dict to attach to the document

        Returns:
            Dict containing the Affinda document response with at least 'identifier'
        """
        if self._client is None:
            raise RuntimeError("Helper not initialized. Use as context manager or call __enter__")

        try:
            # Use the underlying Affinda SDK client
            response = self._client._client.create_document(
                file=file,
                file_name=file_name,
                collection=collection_identifier,
                custom_identifier=custom_identifier,
                wait=wait,
            )

            result = self._client._model_to_dict(response)

            logger.info(
                f"Uploaded document: {file_name} -> {result.get('identifier')} "
                f"(collection: {collection_identifier})"
            )

            return result

        except Exception as e:
            logger.error(f"Failed to upload document {file_name}: {e}")
            raise

    def upload_from_url(
        self,
        url: str,
        file_name: str,
        collection_identifier: str,
        custom_identifier: str | None = None,
        wait: bool = False,
    ) -> dict:
        """
        Upload a document from a URL.

        Args:
            url: URL of the document to upload
            file_name: Name for the file
            collection_identifier: Target collection identifier
            custom_identifier: Optional custom identifier
            wait: Whether to wait for processing

        Returns:
            Dict containing the Affinda document response
        """
        if self._client is None:
            raise RuntimeError("Helper not initialized. Use as context manager or call __enter__")

        try:
            response = self._client._client.create_document(
                url=url,
                file_name=file_name,
                collection=collection_identifier,
                custom_identifier=custom_identifier,
                wait=wait,
            )

            result = self._client._model_to_dict(response)

            logger.info(
                f"Uploaded document from URL: {url} -> {result.get('identifier')} "
                f"(collection: {collection_identifier})"
            )

            return result

        except Exception as e:
            logger.error(f"Failed to upload document from URL {url}: {e}")
            raise


class AffindaDocumentHelper:
    """
    Helper for interacting with Affinda documents.

    Used by post-processors to archive, update, or fetch documents.
    """

    def __init__(self, client: AffindaClient | None = None):
        """
        Initialize the document helper.

        Args:
            client: Optional existing Affinda client
        """
        self._client = client
        self._owns_client = client is None

    def __enter__(self) -> "AffindaDocumentHelper":
        if self._client is None:
            self._client = AffindaClient()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._owns_client and self._client:
            self._client.close()

    def get_document(self, document_identifier: str, compact: bool = False) -> dict:
        """
        Get full document data from Affinda.

        Args:
            document_identifier: The document identifier
            compact: Whether to return compact representation

        Returns:
            Dict containing the document data
        """
        if self._client is None:
            raise RuntimeError("Helper not initialized")

        return self._client.get_document(identifier=document_identifier, compact=compact)

    def archive(self, document_identifier: str) -> bool:
        """
        Archive a document in Affinda.

        Args:
            document_identifier: The document identifier

        Returns:
            True if successful
        """
        if self._client is None:
            raise RuntimeError("Helper not initialized")

        try:
            # Update document state to archived
            self._client._client.update_document(
                identifier=document_identifier,
                state="archived",
            )
            logger.info(f"Archived document: {document_identifier}")
            return True

        except Exception as e:
            logger.error(f"Failed to archive document {document_identifier}: {e}")
            raise

    def update_custom_identifier(self, document_identifier: str, custom_identifier: str) -> bool:
        """
        Update a document's custom identifier.

        Args:
            document_identifier: The document identifier
            custom_identifier: New custom identifier

        Returns:
            True if successful
        """
        if self._client is None:
            raise RuntimeError("Helper not initialized")

        try:
            self._client._client.update_document(
                identifier=document_identifier,
                custom_identifier=custom_identifier,
            )
            logger.info(
                f"Updated custom identifier for {document_identifier}: {custom_identifier}"
            )
            return True

        except Exception as e:
            logger.error(
                f"Failed to update custom identifier for {document_identifier}: {e}"
            )
            raise

    def rename(self, document_identifier: str, new_file_name: str) -> bool:
        """
        Rename a document (update file name).

        Args:
            document_identifier: The document identifier
            new_file_name: New file name

        Returns:
            True if successful
        """
        if self._client is None:
            raise RuntimeError("Helper not initialized")

        try:
            self._client._client.update_document(
                identifier=document_identifier,
                file_name=new_file_name,
            )
            logger.info(f"Renamed document {document_identifier} to: {new_file_name}")
            return True

        except Exception as e:
            logger.error(f"Failed to rename document {document_identifier}: {e}")
            raise

    def update_document(
        self,
        document_identifier: str,
        *,
        custom_identifier: str | None = None,
        file_name: str | None = None,
        state: str | None = None,
        is_confirmed: bool | None = None,
    ) -> dict[str, Any]:
        """
        Update multiple document properties at once.

        Args:
            document_identifier: The document identifier
            custom_identifier: New custom identifier (optional)
            file_name: New file name (optional)
            state: New state (optional)
            is_confirmed: Confirmation status (optional)

        Returns:
            Updated document data
        """
        if self._client is None:
            raise RuntimeError("Helper not initialized")

        try:
            # Build update kwargs
            update_kwargs: dict[str, Any] = {"identifier": document_identifier}
            if custom_identifier is not None:
                update_kwargs["custom_identifier"] = custom_identifier
            if file_name is not None:
                update_kwargs["file_name"] = file_name
            if state is not None:
                update_kwargs["state"] = state
            if is_confirmed is not None:
                update_kwargs["is_confirmed"] = is_confirmed

            response = self._client._client.update_document(**update_kwargs)
            result = self._client._model_to_dict(response)

            logger.info(f"Updated document {document_identifier}")
            return result

        except Exception as e:
            logger.error(f"Failed to update document {document_identifier}: {e}")
            raise


class AffindaDataSourceHelper:
    """
    Helper for interacting with Affinda data sources.

    Used by data source plugins to sync data to Affinda data sources.
    """

    def __init__(self, client: AffindaClient | None = None):
        """
        Initialize the data source helper.

        Args:
            client: Optional existing Affinda client
        """
        self._client = client
        self._owns_client = client is None

    def __enter__(self) -> "AffindaDataSourceHelper":
        if self._client is None:
            self._client = AffindaClient()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        if self._owns_client and self._client:
            self._client.close()

    def get_data_sources(self, organization: str | None = None) -> list[dict]:
        """
        Get list of available data sources from Affinda.

        Args:
            organization: Optional organization identifier to filter by

        Returns:
            List of data source dictionaries
        """
        if self._client is None:
            raise RuntimeError("Helper not initialized")

        try:
            # Use the Affinda SDK to list data sources
            response = self._client._client.get_all_data_sources(organization=organization)

            # Convert to list of dicts
            if hasattr(response, '__iter__'):
                return [self._client._model_to_dict(ds) for ds in response]
            return []

        except Exception as e:
            logger.error(f"Failed to get data sources: {e}")
            raise

    def get_data_source(self, identifier: str) -> dict:
        """
        Get a specific data source by identifier.

        Args:
            identifier: The data source identifier

        Returns:
            Data source dictionary
        """
        if self._client is None:
            raise RuntimeError("Helper not initialized")

        try:
            response = self._client._client.get_data_source(identifier=identifier)
            return self._client._model_to_dict(response)

        except Exception as e:
            logger.error(f"Failed to get data source {identifier}: {e}")
            raise

    def sync_records(
        self,
        data_source_identifier: str,
        records: list,
        replace_all: bool = False,
    ) -> dict:
        """
        Sync records to an Affinda data source.

        Args:
            data_source_identifier: The Affinda data source identifier
            records: List of DataSourceRecord objects to sync
            replace_all: If True, replace all existing records; if False, upsert

        Returns:
            Dict with sync results (created, updated, failed counts)
        """
        if self._client is None:
            raise RuntimeError("Helper not initialized")

        try:
            # Convert DataSourceRecord objects to the format expected by Affinda
            # Each record should have an identifier and data fields
            record_data = []
            for record in records:
                record_data.append({
                    "identifier": record.identifier,
                    "data": record.data,
                })

            # Use batch create/update endpoint
            # The exact API call depends on the Affinda SDK version
            response = self._client._client.create_data_source_data(
                identifier=data_source_identifier,
                data=record_data,
            )

            result = self._client._model_to_dict(response) if response else {}

            logger.info(
                f"Synced {len(records)} records to data source {data_source_identifier}"
            )

            return {
                "created": result.get("created", 0),
                "updated": result.get("updated", 0),
                "failed": result.get("failed", 0),
                "total": len(records),
            }

        except Exception as e:
            logger.error(
                f"Failed to sync records to data source {data_source_identifier}: {e}"
            )
            raise

    def delete_records(
        self,
        data_source_identifier: str,
        record_identifiers: list[str],
    ) -> dict:
        """
        Delete specific records from a data source.

        Args:
            data_source_identifier: The data source identifier
            record_identifiers: List of record identifiers to delete

        Returns:
            Dict with deletion results
        """
        if self._client is None:
            raise RuntimeError("Helper not initialized")

        try:
            deleted = 0
            errors = []

            for record_id in record_identifiers:
                try:
                    self._client._client.delete_data_source_data(
                        identifier=data_source_identifier,
                        data_identifier=record_id,
                    )
                    deleted += 1
                except Exception as e:
                    errors.append(f"{record_id}: {str(e)}")

            logger.info(
                f"Deleted {deleted}/{len(record_identifiers)} records from "
                f"data source {data_source_identifier}"
            )

            return {
                "deleted": deleted,
                "failed": len(errors),
                "errors": errors,
            }

        except Exception as e:
            logger.error(
                f"Failed to delete records from data source {data_source_identifier}: {e}"
            )
            raise

    def get_records(
        self,
        data_source_identifier: str,
        limit: int = 100,
        offset: int = 0,
    ) -> dict:
        """
        Get records from a data source.

        Args:
            data_source_identifier: The data source identifier
            limit: Maximum number of records to return
            offset: Offset for pagination

        Returns:
            Dict with records and pagination info
        """
        if self._client is None:
            raise RuntimeError("Helper not initialized")

        try:
            response = self._client._client.get_all_data_source_data(
                identifier=data_source_identifier,
                limit=limit,
                offset=offset,
            )

            # Convert response to list of dicts
            if hasattr(response, 'results'):
                records = [self._client._model_to_dict(r) for r in response.results]
                return {
                    "count": getattr(response, 'count', len(records)),
                    "records": records,
                }
            elif hasattr(response, '__iter__'):
                records = [self._client._model_to_dict(r) for r in response]
                return {
                    "count": len(records),
                    "records": records,
                }
            return {"count": 0, "records": []}

        except Exception as e:
            logger.error(
                f"Failed to get records from data source {data_source_identifier}: {e}"
            )
            raise
