from django.urls import include, path
from rest_framework.routers import DefaultRouter

from affinda_bridge import api_views, auth_views, system_views

# Create a router and register our viewsets
router = DefaultRouter()
router.register(r"workspaces", api_views.WorkspaceViewSet, basename="workspace")
router.register(r"collections", api_views.CollectionViewSet, basename="collection")
router.register(r"field-definitions", api_views.FieldDefinitionViewSet, basename="field-definition")
router.register(r"data-points", api_views.DataPointViewSet, basename="data-point")
router.register(r"documents", api_views.DocumentViewSet, basename="document")
router.register(r"sync-history", api_views.SyncHistoryViewSet, basename="sync-history")
router.register(r"collection-views", api_views.CollectionViewViewSet, basename="collection-view")
router.register(r"document-field-values", api_views.DocumentFieldValueViewSet, basename="document-field-value")
router.register(r"external-tables", api_views.ExternalTableViewSet, basename="external-table")
router.register(r"external-table-columns", api_views.ExternalTableColumnViewSet, basename="external-table-column")

urlpatterns = [
    # Authentication endpoints
    path("api/auth/login/", auth_views.login, name="auth-login"),
    path("api/auth/logout/", auth_views.logout, name="auth-logout"),
    path("api/auth/profile/", auth_views.user_profile, name="auth-profile"),
    # System endpoints
    path("api/system/version/", system_views.version_info, name="system-version"),
    path("api/system/status/", system_views.system_status, name="system-status"),
    path("api/system/updates/check/", system_views.check_updates, name="system-check-updates"),
    path("api/system/updates/apply/", system_views.apply_updates, name="system-apply-updates"),
    # Affinda API settings endpoints
    path("api/system/affinda/", system_views.get_affinda_settings, name="system-affinda-settings"),
    path("api/system/affinda/update/", system_views.update_affinda_settings, name="system-affinda-update"),
    path("api/system/affinda/test/", system_views.test_affinda_connection, name="system-affinda-test"),
    path("api/system/affinda/clear/", system_views.clear_affinda_api_key, name="system-affinda-clear"),
    # API endpoints
    path("api/", include(router.urls)),
]
