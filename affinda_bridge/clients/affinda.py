import os
from typing import Any, Dict, Optional

from affinda import AffindaAPI
from azure.core.credentials import AzureKeyCredential


class AffindaClient:
    """
    Wrapper around the official Affinda Python SDK.
    Provides a simplified interface for common operations.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ) -> None:
        token = api_key or os.environ.get("AFFINDA_API_KEY", "")
        if not token:
            raise ValueError("AFFINDA_API_KEY is required")

        base = base_url or os.environ.get("AFFINDA_BASE_URL", "https://api.affinda.com")

        credential = AzureKeyCredential(token)
        self._client = AffindaAPI(
            credential=credential,
            endpoint=base,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "AffindaClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    def list_documents(
        self,
        *,
        offset: Optional[int] = None,
        limit: Optional[int] = None,
        workspace: Optional[str] = None,
        collection: Optional[str] = None,
        state: Optional[str] = None,
        tags: Optional[list[str]] = None,
        created_dt: Optional[str] = None,
        search: Optional[str] = None,
        ordering: Optional[list[str]] = None,
        include_data: Optional[bool] = None,
        exclude: Optional[list[str]] = None,
        in_review: Optional[bool] = None,
        failed: Optional[bool] = None,
        ready: Optional[bool] = None,
        validatable: Optional[bool] = None,
        has_challenges: Optional[bool] = None,
        custom_identifier: Optional[str] = None,
        compact: Optional[bool] = None,
        count: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """List all documents with optional filtering."""
        response = self._client.get_all_documents(
            offset=offset,
            limit=limit,
            workspace=workspace,
            collection=collection,
            state=state,
            created_dt=created_dt,
            search=search,
            ordering=ordering,
            include_data=include_data,
            exclude=exclude,
            in_review=in_review,
            failed=failed,
            ready=ready,
            validatable=validatable,
            has_challenges=has_challenges,
            custom_identifier=custom_identifier,
            compact=compact,
            count=count,
        )

        # Convert response to dict format
        # The SDK returns a paginated response object
        results = []
        if hasattr(response, "results") and response.results:
            results = [self._model_to_dict(doc) for doc in response.results]

        return {
            "count": getattr(response, "count", len(results)),
            "next": getattr(response, "next", None),
            "previous": getattr(response, "previous", None),
            "results": results,
        }

    def get_document(self, *, identifier: str, compact: Optional[bool] = None) -> Dict[str, Any]:
        """Get a specific document by identifier."""
        doc = self._client.get_document(identifier=identifier, compact=compact)
        return self._model_to_dict(doc)

    def list_workspaces(
        self,
        *,
        organization: str,
        name: Optional[str] = None,
    ) -> list[Dict[str, Any]]:
        """List all workspaces for an organization."""
        workspaces = self._client.get_all_workspaces(
            organization=organization,
            name=name,
        )
        # Handle both paginated and list responses
        if hasattr(workspaces, "results"):
            results = getattr(workspaces, "results", [])
            if results:
                return [self._model_to_dict(ws) for ws in results]
        # If it's already a list, convert directly
        if isinstance(workspaces, list):
            return [self._model_to_dict(ws) for ws in workspaces]
        return []

    def list_collections(
        self,
        *,
        workspace: str,
    ) -> list[Dict[str, Any]]:
        """List all collections in a workspace."""
        collections = self._client.get_all_collections(workspace=workspace)
        # Handle both paginated and list responses
        if hasattr(collections, "results"):
            results = getattr(collections, "results", [])
            if results:
                return [self._model_to_dict(col) for col in results]
        # If it's already a list, convert directly
        if isinstance(collections, list):
            return [self._model_to_dict(col) for col in collections]
        return []

    def get_collection(self, *, identifier: str) -> Dict[str, Any]:
        """Get a specific collection by identifier."""
        collection = self._client.get_collection(identifier=identifier)
        return self._model_to_dict(collection)

    def get_collection_field(
        self,
        *,
        collection_identifier: str,
        datapoint_identifier: str,
    ) -> Dict[str, Any]:
        """Get a specific field definition from a collection."""
        # The SDK might not have this exact method, try alternative approach
        collection = self.get_collection(identifier=collection_identifier)

        # Look for the field in the collection's fields
        if "fields" in collection:
            for field in collection["fields"]:
                if field.get("datapoint_identifier") == datapoint_identifier:
                    return field

        # Fallback: return empty field structure
        return {
            "datapoint_identifier": datapoint_identifier,
            "name": "",
            "slug": "",
            "data_type": "",
            "mandatory": False,
        }

    def list_data_points(
        self,
        *,
        offset: Optional[int] = None,
        limit: Optional[int] = None,
        organization: Optional[str] = None,
        include_public: Optional[bool] = None,
        extractor: Optional[str] = None,
        slug: Optional[str] = None,
        description: Optional[str] = None,
        annotation_content_type: Optional[str] = None,
        identifier: Optional[list[str]] = None,
    ) -> list[Dict[str, Any]]:
        """List all data points with optional filtering."""
        data_points = self._client.get_all_data_points(
            offset=offset,
            limit=limit,
            organization=organization,
            include_public=include_public,
            extractor=extractor,
            slug=slug,
            description=description,
            annotation_content_type=annotation_content_type,
            identifier=identifier,
        )
        # Handle both paginated and list responses
        if hasattr(data_points, "results"):
            results = getattr(data_points, "results", [])
            if results:
                return [self._model_to_dict(dp) for dp in results]
        # If it's already a list, convert directly
        if isinstance(data_points, list):
            return [self._model_to_dict(dp) for dp in data_points]
        return []

    def list_workspaces_with_collections(
        self,
        *,
        organization: str,
        name: Optional[str] = None,
    ) -> list[Dict[str, Any]]:
        """List all workspaces with their collections."""
        workspaces = self.list_workspaces(organization=organization, name=name)
        results = []
        for workspace in workspaces:
            workspace_id = workspace.get("identifier")
            if not workspace_id:
                raise ValueError("Workspace is missing identifier")
            collections = self.list_collections(workspace=workspace_id)
            results.append({"workspace": workspace, "collections": collections})
        return results

    def _model_to_dict(self, model: Any) -> Dict[str, Any]:
        """
        Convert any Affinda SDK model to a dictionary.
        The SDK models have an as_dict() method that handles serialization.
        """
        if hasattr(model, "as_dict"):
            return model.as_dict()

        # Fallback for non-model objects
        if isinstance(model, dict):
            return model

        # For other objects, try to convert them to dict
        result = {}
        for attr in dir(model):
            if not attr.startswith("_") and not callable(getattr(model, attr)):
                try:
                    value = getattr(model, attr)
                    if value is not None:
                        result[attr] = value
                except AttributeError:
                    pass

        return result
