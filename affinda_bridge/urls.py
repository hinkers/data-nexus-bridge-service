from django.urls import path

from affinda_bridge import views

urlpatterns = [
    path(
        "affina/api/sync-field-definitions/",
        views.sync_field_definitions,
        name="sync-field-definitions",
    ),
]
