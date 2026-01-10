import httpx
import pytest

from affinda_bridge.clients.affinda import AffindaClient


def test_list_documents_builds_request(monkeypatch):
    monkeypatch.setenv("AFFINDA_API_KEY", "test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.scheme == "https"
        assert request.url.host == "api.affinda.com"
        assert request.url.path == "/v3/documents"
        assert request.headers["Authorization"] == "Bearer test-key"

        params = dict(request.url.params)
        assert params == {"limit": "2", "search": "resume"}

        return httpx.Response(200, json={"count": 0, "results": []})

    transport = httpx.MockTransport(handler)
    client = AffindaClient(transport=transport)

    data = client.list_documents(limit=2, search="resume")
    assert data["count"] == 0
    assert data["results"] == []


def test_list_documents_raises_for_error(monkeypatch):
    monkeypatch.setenv("AFFINDA_API_KEY", "test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"detail": "Unauthorized"})

    transport = httpx.MockTransport(handler)
    client = AffindaClient(transport=transport)

    with pytest.raises(httpx.HTTPStatusError):
        client.list_documents()


def test_list_workspaces_builds_request(monkeypatch):
    monkeypatch.setenv("AFFINDA_API_KEY", "test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/v3/workspaces"
        params = dict(request.url.params)
        assert params == {"organization": "org-123", "name": "Main"}
        return httpx.Response(200, json=[{"identifier": "ws-1"}])

    transport = httpx.MockTransport(handler)
    client = AffindaClient(transport=transport)

    data = client.list_workspaces(organization="org-123", name="Main")
    assert data == [{"identifier": "ws-1"}]


def test_list_collections_builds_request(monkeypatch):
    monkeypatch.setenv("AFFINDA_API_KEY", "test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/v3/collections"
        params = dict(request.url.params)
        assert params == {"workspace": "ws-1"}
        return httpx.Response(200, json=[{"identifier": "col-1"}])

    transport = httpx.MockTransport(handler)
    client = AffindaClient(transport=transport)

    data = client.list_collections(workspace="ws-1")
    assert data == [{"identifier": "col-1"}]


def test_get_collection_field_builds_request(monkeypatch):
    monkeypatch.setenv("AFFINDA_API_KEY", "test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert (
            request.url.path
            == "/v3/collections/col-1/fields/datapoint-123"
        )
        return httpx.Response(200, json={"identifier": "field-1"})

    transport = httpx.MockTransport(handler)
    client = AffindaClient(transport=transport)

    data = client.get_collection_field(
        collection_identifier="col-1",
        datapoint_identifier="datapoint-123",
    )
    assert data == {"identifier": "field-1"}


def test_list_data_points_builds_request(monkeypatch):
    monkeypatch.setenv("AFFINDA_API_KEY", "test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path == "/v3/data_points"
        params = dict(request.url.params)
        assert params == {
            "organization": "org-123",
            "include_public": "true",
            "limit": "10",
            "offset": "20",
        }
        return httpx.Response(200, json=[{"identifier": "dp-1"}])

    transport = httpx.MockTransport(handler)
    client = AffindaClient(transport=transport)

    data = client.list_data_points(
        organization="org-123",
        include_public=True,
        limit=10,
        offset=20,
    )
    assert data == [{"identifier": "dp-1"}]


def test_list_workspaces_with_collections(monkeypatch):
    monkeypatch.setenv("AFFINDA_API_KEY", "test-key")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v3/workspaces":
            return httpx.Response(
                200,
                json=[{"identifier": "ws-1"}, {"identifier": "ws-2"}],
            )
        if request.url.path == "/v3/collections":
            params = dict(request.url.params)
            if params.get("workspace") == "ws-1":
                return httpx.Response(200, json=[{"identifier": "col-1"}])
            if params.get("workspace") == "ws-2":
                return httpx.Response(200, json=[{"identifier": "col-2"}])
        return httpx.Response(404, json={"detail": "Not found"})

    transport = httpx.MockTransport(handler)
    client = AffindaClient(transport=transport)

    data = client.list_workspaces_with_collections(organization="org-123")
    assert data == [
        {"workspace": {"identifier": "ws-1"}, "collections": [{"identifier": "col-1"}]},
        {"workspace": {"identifier": "ws-2"}, "collections": [{"identifier": "col-2"}]},
    ]
