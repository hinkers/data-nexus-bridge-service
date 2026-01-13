"""
API views for plugin management.
"""
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from plugins.executor import execute_importer
from plugins.models import Plugin, PluginComponent, PluginExecutionLog, PluginInstance
from plugins.registry import plugin_registry
from plugins.serializers import (
    AvailablePluginSerializer,
    ImportResultSerializer,
    PluginComponentSerializer,
    PluginExecutionLogSerializer,
    PluginInstanceCreateSerializer,
    PluginInstanceSerializer,
    PluginSerializer,
)


class PluginViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing installed plugins.
    """
    queryset = Plugin.objects.prefetch_related('components').all()
    serializer_class = PluginSerializer
    lookup_field = 'slug'

    def get_queryset(self):
        queryset = super().get_queryset()
        # Filter by enabled status if provided
        enabled = self.request.query_params.get('enabled')
        if enabled is not None:
            queryset = queryset.filter(enabled=enabled.lower() == 'true')
        return queryset

    @action(detail=False, methods=['get'])
    def available(self, request):
        """
        List all available plugins from the registry (discovered but not necessarily installed).
        """
        plugins = plugin_registry.list_plugins()
        serializer = AvailablePluginSerializer(plugins, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def toggle(self, request, slug=None):
        """
        Toggle a plugin's enabled status.
        """
        plugin = self.get_object()
        plugin.enabled = not plugin.enabled
        plugin.save()
        return Response({'enabled': plugin.enabled})

    @action(detail=False, methods=['post'])
    def install(self, request):
        """
        Install a plugin from the registry.

        Request body:
        {
            "slug": "plugin-slug",
            "config": {}  // optional plugin-level config
        }
        """
        slug = request.data.get('slug')
        config = request.data.get('config', {})

        if not slug:
            return Response(
                {'detail': 'Plugin slug is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Check if already installed
        if Plugin.objects.filter(slug=slug).exists():
            return Response(
                {'detail': f'Plugin {slug} is already installed'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get plugin from registry
        plugin_class = plugin_registry.get_plugin(slug)
        if not plugin_class:
            return Response(
                {'detail': f'Plugin {slug} not found in registry'},
                status=status.HTTP_404_NOT_FOUND
            )

        meta = plugin_class.get_meta()

        # Create plugin record
        plugin = Plugin.objects.create(
            slug=meta.slug,
            name=meta.name,
            author=meta.author,
            version=meta.version,
            description=meta.description,
            python_path=f"{plugin_class.__module__}.{plugin_class.__name__}",
            config_schema=meta.config_schema,
            config=config,
        )

        # Create component records
        for importer_class in plugin_class.get_importers():
            comp_meta = importer_class.get_meta()
            PluginComponent.objects.create(
                plugin=plugin,
                component_type=PluginComponent.COMPONENT_TYPE_IMPORTER,
                slug=comp_meta.slug,
                name=comp_meta.name,
                description=comp_meta.description,
                python_path=f"{importer_class.__module__}.{importer_class.__name__}",
                config_schema=comp_meta.config_schema,
            )

        for preprocessor_class in plugin_class.get_preprocessors():
            comp_meta = preprocessor_class.get_meta()
            PluginComponent.objects.create(
                plugin=plugin,
                component_type=PluginComponent.COMPONENT_TYPE_PREPROCESSOR,
                slug=comp_meta.slug,
                name=comp_meta.name,
                description=comp_meta.description,
                python_path=f"{preprocessor_class.__module__}.{preprocessor_class.__name__}",
                config_schema=comp_meta.config_schema,
            )

        for postprocessor_class in plugin_class.get_postprocessors():
            comp_meta = postprocessor_class.get_meta()
            PluginComponent.objects.create(
                plugin=plugin,
                component_type=PluginComponent.COMPONENT_TYPE_POSTPROCESSOR,
                slug=comp_meta.slug,
                name=comp_meta.name,
                description=comp_meta.description,
                python_path=f"{postprocessor_class.__module__}.{postprocessor_class.__name__}",
                config_schema=comp_meta.config_schema,
            )

        serializer = PluginSerializer(plugin)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'])
    def uninstall(self, request, slug=None):
        """
        Uninstall a plugin (removes all instances and components).
        """
        plugin = self.get_object()

        # Delete all instances first
        PluginInstance.objects.filter(component__plugin=plugin).delete()

        # Delete the plugin (cascades to components)
        plugin.delete()

        return Response(status=status.HTTP_204_NO_CONTENT)


class PluginComponentViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing plugin components.
    """
    queryset = PluginComponent.objects.select_related('plugin').all()
    serializer_class = PluginComponentSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by plugin
        plugin_slug = self.request.query_params.get('plugin')
        if plugin_slug:
            queryset = queryset.filter(plugin__slug=plugin_slug)

        # Filter by component type
        component_type = self.request.query_params.get('type')
        if component_type:
            queryset = queryset.filter(component_type=component_type)

        return queryset

    @action(detail=False, methods=['get'])
    def importers(self, request):
        """List all importer components."""
        queryset = self.get_queryset().filter(
            component_type=PluginComponent.COMPONENT_TYPE_IMPORTER
        )
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def preprocessors(self, request):
        """List all pre-processor components."""
        queryset = self.get_queryset().filter(
            component_type=PluginComponent.COMPONENT_TYPE_PREPROCESSOR
        )
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def postprocessors(self, request):
        """List all post-processor components."""
        queryset = self.get_queryset().filter(
            component_type=PluginComponent.COMPONENT_TYPE_POSTPROCESSOR
        )
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class PluginInstanceViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing plugin instances.
    """
    queryset = PluginInstance.objects.select_related(
        'component', 'component__plugin'
    ).prefetch_related('collections').all()
    serializer_class = PluginInstanceSerializer

    def get_serializer_class(self):
        if self.action == 'create':
            return PluginInstanceCreateSerializer
        return PluginInstanceSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by component type
        component_type = self.request.query_params.get('type')
        if component_type:
            queryset = queryset.filter(component__component_type=component_type)

        # Filter by plugin
        plugin_slug = self.request.query_params.get('plugin')
        if plugin_slug:
            queryset = queryset.filter(component__plugin__slug=plugin_slug)

        # Filter by enabled
        enabled = self.request.query_params.get('enabled')
        if enabled is not None:
            queryset = queryset.filter(enabled=enabled.lower() == 'true')

        return queryset

    @action(detail=True, methods=['post'])
    def toggle(self, request, pk=None):
        """Toggle an instance's enabled status."""
        instance = self.get_object()
        instance.enabled = not instance.enabled
        instance.save()
        return Response({'enabled': instance.enabled})

    @action(detail=True, methods=['post'])
    def run(self, request, pk=None):
        """
        Run an importer instance manually.

        Only works for importer instances.
        """
        instance = self.get_object()

        if instance.component.component_type != PluginComponent.COMPONENT_TYPE_IMPORTER:
            return Response(
                {'detail': 'Only importer instances can be run manually'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            results = execute_importer(instance)
            serializer = ImportResultSerializer(results, many=True)
            return Response({
                'success': True,
                'results': serializer.data,
            })
        except Exception as e:
            return Response(
                {'success': False, 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def importers(self, request):
        """List all importer instances."""
        queryset = self.get_queryset().filter(
            component__component_type=PluginComponent.COMPONENT_TYPE_IMPORTER
        )
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def preprocessors(self, request):
        """List all pre-processor instances."""
        queryset = self.get_queryset().filter(
            component__component_type=PluginComponent.COMPONENT_TYPE_PREPROCESSOR
        )
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def postprocessors(self, request):
        """List all post-processor instances."""
        queryset = self.get_queryset().filter(
            component__component_type=PluginComponent.COMPONENT_TYPE_POSTPROCESSOR
        )
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class PluginExecutionLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing plugin execution logs.
    """
    queryset = PluginExecutionLog.objects.select_related(
        'instance', 'document'
    ).all()
    serializer_class = PluginExecutionLogSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by instance
        instance_id = self.request.query_params.get('instance')
        if instance_id:
            queryset = queryset.filter(instance_id=instance_id)

        # Filter by document
        document_id = self.request.query_params.get('document')
        if document_id:
            queryset = queryset.filter(document_id=document_id)

        # Filter by status
        log_status = self.request.query_params.get('status')
        if log_status:
            queryset = queryset.filter(status=log_status)

        # Filter by event type
        event_type = self.request.query_params.get('event')
        if event_type:
            queryset = queryset.filter(event_type=event_type)

        return queryset
