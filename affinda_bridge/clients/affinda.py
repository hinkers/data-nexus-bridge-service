import os
from typing import Any, Dict, Optional

import httpx


class AffindaClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: float = 10.0,
        transport: Optional[httpx.BaseTransport] = None,
        client: Optional[httpx.Client] = None,
    ) -> None:
        if client is not None:
            self._client = client
            return

        token = api_key or os.environ.get("AFFINDA_API_KEY", "")
        if not token:
            raise ValueError("AFFINDA_API_KEY is required")

        base = base_url or os.environ.get("AFFINDA_BASE_URL", "https://api.affinda.com")
        headers = {"Authorization": f"Bearer {token}"}
        self._client = httpx.Client(
            base_url=base,
            headers=headers,
            timeout=timeout,
            transport=transport,
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
        snake_case: Optional[bool] = None,
    ) -> Dict[str, Any]:
        params: Dict[str, Any] = {}
        for key, value in {
            "offset": offset,
            "limit": limit,
            "workspace": workspace,
            "collection": collection,
            "state": state,
            "tags": tags,
            "created_dt": created_dt,
            "search": search,
            "ordering": ordering,
            "include_data": include_data,
            "exclude": exclude,
            "in_review": in_review,
            "failed": failed,
            "ready": ready,
            "validatable": validatable,
            "has_challenges": has_challenges,
            "custom_identifier": custom_identifier,
            "compact": compact,
            "count": count,
            "snake_case": snake_case,
        }.items():
            if value is not None:
                params[key] = value

        response = self._client.get("/v3/documents", params=params)
        response.raise_for_status()
        return response.json()

    def list_workspaces(
        self,
        *,
        organization: str,
        name: Optional[str] = None,
    ) -> list[Dict[str, Any]]:
        params: Dict[str, Any] = {"organization": organization}
        if name is not None:
            params["name"] = name

        response = self._client.get("/v3/workspaces", params=params)
        response.raise_for_status()
        return response.json()

    def list_collections(
        self,
        *,
        workspace: str,
    ) -> list[Dict[str, Any]]:
        params = {"workspace": workspace}
        response = self._client.get("/v3/collections", params=params)
        response.raise_for_status()
        return response.json()

    def get_collection(self, *, identifier: str) -> Dict[str, Any]:
        response = self._client.get(f"/v3/collections/{identifier}")
        response.raise_for_status()
        return response.json()

    def get_collection_field(
        self,
        *,
        collection_identifier: str,
        datapoint_identifier: str,
    ) -> Dict[str, Any]:
        response = self._client.get(
            f"/v3/collections/{collection_identifier}/fields/{datapoint_identifier}"
        )
        response.raise_for_status()
        return response.json()

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
        params: Dict[str, Any] = {}
        for key, value in {
            "offset": offset,
            "limit": limit,
            "organization": organization,
            "include_public": include_public,
            "extractor": extractor,
            "slug": slug,
            "description": description,
            "annotation_content_type": annotation_content_type,
            "identifier": identifier,
        }.items():
            if value is not None:
                params[key] = value

        response = self._client.get("/v3/data_points", params=params)
        response.raise_for_status()
        return response.json()

    def list_workspaces_with_collections(
        self,
        *,
        organization: str,
        name: Optional[str] = None,
    ) -> list[Dict[str, Any]]:
        workspaces = self.list_workspaces(organization=organization, name=name)
        results = []
        for workspace in workspaces:
            workspace_id = workspace.get("identifier")
            if not workspace_id:
                raise ValueError("Workspace is missing identifier")
            collections = self.list_collections(workspace=workspace_id)
            results.append({"workspace": workspace, "collections": collections})
        return results
