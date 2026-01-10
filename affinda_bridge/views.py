import os

import httpx
from django.http import JsonResponse
from django.views.decorators.http import require_POST

from affinda_bridge.clients import AffindaClient
from affinda_bridge.models import Collection, FieldDefinition, Workspace


@require_POST
def sync_field_definitions(request):
    organization = os.environ.get("AFFINDA_ORG_ID")
    if not organization:
        return JsonResponse(
            {"detail": "AFFINDA_ORG_ID not set"},
            status=500,
        )

    workspaces_upserted = 0
    collections_upserted = 0
    fields_upserted = 0
    fields_skipped = 0

    with AffindaClient() as client:
        workspaces = client.list_workspaces(organization=organization)
        data_points = client.list_data_points(
            organization=organization,
            include_public=True,
        )

        for workspace in workspaces:
            workspace_id = workspace.get("identifier")
            if not workspace_id:
                continue
            workspace_obj, _ = Workspace.objects.update_or_create(
                identifier=workspace_id,
                defaults={
                    "name": workspace.get("name", ""),
                    "organization_identifier": organization,
                    "raw": workspace,
                },
            )
            workspaces_upserted += 1

            collections = client.list_collections(
                workspace=workspace_obj.identifier,
            )
            for collection in collections:
                collection_id = collection.get("identifier")
                if not collection_id:
                    continue
                collection_obj, _ = Collection.objects.update_or_create(
                    identifier=collection_id,
                    defaults={
                        "name": collection.get("name", ""),
                        "workspace": workspace_obj,
                        "raw": collection,
                    },
                )
                collections_upserted += 1

                for datapoint in data_points:
                    datapoint_id = datapoint.get("identifier")
                    if not datapoint_id:
                        continue
                    try:
                        field = client.get_collection_field(
                            collection_identifier=collection_obj.identifier,
                            datapoint_identifier=datapoint_id,
                        )
                    except httpx.HTTPStatusError as exc:
                        if exc.response is not None and exc.response.status_code == 404:
                            fields_skipped += 1
                            continue
                        raise

                    FieldDefinition.objects.update_or_create(
                        collection=collection_obj,
                        datapoint_identifier=datapoint_id,
                        defaults={
                            "name": field.get("name", "") or datapoint.get("name", ""),
                            "slug": field.get("slug", "") or datapoint.get("slug", ""),
                            "data_type": field.get("annotationContentType", "")
                            or datapoint.get("annotationContentType", "")
                            or datapoint.get("annotation_content_type", ""),
                            "raw": field,
                        },
                    )
                    fields_upserted += 1

    return JsonResponse(
        {
            "workspaces_upserted": workspaces_upserted,
            "collections_upserted": collections_upserted,
            "fields_upserted": fields_upserted,
            "fields_skipped": fields_skipped,
        }
    )
