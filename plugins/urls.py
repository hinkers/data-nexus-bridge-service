"""
URL configuration for plugin API.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from plugins import api_views

router = DefaultRouter()
router.register(r'plugins', api_views.PluginViewSet, basename='plugin')
router.register(r'plugin-components', api_views.PluginComponentViewSet, basename='plugin-component')
router.register(r'plugin-instances', api_views.PluginInstanceViewSet, basename='plugin-instance')
router.register(r'plugin-logs', api_views.PluginExecutionLogViewSet, basename='plugin-log')

urlpatterns = [
    path('api/', include(router.urls)),
]
