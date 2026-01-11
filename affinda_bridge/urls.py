from django.urls import include, path
from rest_framework.routers import DefaultRouter

from affinda_bridge import api_views, auth_views

# Create a router and register our viewsets
router = DefaultRouter()
router.register(r"workspaces", api_views.WorkspaceViewSet, basename="workspace")
router.register(r"collections", api_views.CollectionViewSet, basename="collection")
router.register(r"field-definitions", api_views.FieldDefinitionViewSet, basename="field-definition")
router.register(r"data-points", api_views.DataPointViewSet, basename="data-point")
router.register(r"documents", api_views.DocumentViewSet, basename="document")

urlpatterns = [
    # Authentication endpoints
    path("api/auth/login/", auth_views.login, name="auth-login"),
    path("api/auth/logout/", auth_views.logout, name="auth-logout"),
    path("api/auth/profile/", auth_views.user_profile, name="auth-profile"),
    # API endpoints
    path("api/", include(router.urls)),
]
