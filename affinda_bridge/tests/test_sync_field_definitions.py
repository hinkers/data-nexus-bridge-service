import os
from unittest.mock import patch

import httpx
from django.test import Client, TestCase

from affinda_bridge.models import Collection, FieldDefinition, Workspace


class BaseMockClient:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return None

    def list_workspaces(self, organization, name=None):
        return [
            {"identifier": "ws-1", "name": "Workspace One"},
            {"identifier": "ws-2", "name": "Workspace Two"},
        ]

    def list_collections(self, workspace):
        if workspace == "ws-1":
            return [
                {"identifier": "col-1", "name": "Collection One"},
                {"identifier": "col-2", "name": "Collection Two"},
            ]
        return []

    def list_data_points(self, **kwargs):
        return [
            {"identifier": "dp-1", "name": "Field One", "slug": "field_one"},
            {"identifier": "dp-2", "name": "Field Two", "slug": "field_two"},
        ]

    def get_collection_field(self, collection_identifier, datapoint_identifier):
        if datapoint_identifier == "dp-1":
            return {
                "name": "Field One",
                "slug": "field_one",
                "annotationContentType": "text",
            }
        raise httpx.HTTPStatusError(
            "Not found",
            request=httpx.Request("GET", "https://api.affinda.com"),
            response=httpx.Response(404),
        )


class UpdatedMockClient(BaseMockClient):
    def list_workspaces(self, organization, name=None):
        return [
            {"identifier": "ws-1", "name": "Workspace One Updated"},
            {"identifier": "ws-2", "name": "Workspace Two"},
        ]

    def list_collections(self, workspace):
        if workspace == "ws-1":
            return [
                {"identifier": "col-1", "name": "Collection One Updated"},
                {"identifier": "col-2", "name": "Collection Two"},
            ]
        return []

    def get_collection_field(self, collection_identifier, datapoint_identifier):
        if datapoint_identifier == "dp-1":
            return {
                "name": "Field One Updated",
                "slug": "field_one",
                "annotationContentType": "text",
            }
        return super().get_collection_field(collection_identifier, datapoint_identifier)


class SyncFieldDefinitionsTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_sync_field_definitions_creates_records(self):
        with patch.dict(os.environ, {"AFFINDA_ORG_ID": "org-123"}):
            with patch("affinda_bridge.api_views.AffindaClient", BaseMockClient):
                response = self.client.post("/api/workspaces/sync/")

        assert response.status_code == 200
        payload = response.json()
        assert payload == {
            "workspaces_upserted": 2,
            "collections_upserted": 2,
            "fields_upserted": 2,
            "fields_skipped": 2,
        }

        assert Workspace.objects.count() == 2
        assert Collection.objects.count() == 2
        assert FieldDefinition.objects.count() == 2

        field = FieldDefinition.objects.get(
            collection__identifier="col-1",
            datapoint_identifier="dp-1",
        )
        assert field.name == "Field One"
        assert field.data_type == "text"

    def test_sync_field_definitions_upserts(self):
        with patch.dict(os.environ, {"AFFINDA_ORG_ID": "org-123"}):
            with patch("affinda_bridge.api_views.AffindaClient", BaseMockClient):
                response = self.client.post("/api/workspaces/sync/")
                assert response.status_code == 200

            with patch("affinda_bridge.api_views.AffindaClient", UpdatedMockClient):
                response = self.client.post("/api/workspaces/sync/")
                assert response.status_code == 200

        assert Workspace.objects.count() == 2
        assert Collection.objects.count() == 2
        assert FieldDefinition.objects.count() == 2

        workspace = Workspace.objects.get(identifier="ws-1")
        assert workspace.name == "Workspace One Updated"

        collection = Collection.objects.get(identifier="col-1")
        assert collection.name == "Collection One Updated"

        field = FieldDefinition.objects.get(
            collection__identifier="col-1",
            datapoint_identifier="dp-1",
        )
        assert field.name == "Field One Updated"
