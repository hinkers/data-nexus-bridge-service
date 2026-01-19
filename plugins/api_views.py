"""
API views for plugin management.
"""
import re

from django.utils.text import slugify
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from plugins.dependencies import check_dependencies, install_dependencies
from plugins.executor import execute_datasource, execute_importer
from plugins.models import Plugin, PluginComponent, PluginExecutionLog, PluginInstance, PluginSource
from plugins.registry import plugin_registry
from plugins.serializers import (
    AvailablePluginSerializer,
    DependencyStatusSerializer,
    ImportResultSerializer,
    PluginComponentSerializer,
    PluginExecutionLogSerializer,
    PluginInstanceCreateSerializer,
    PluginInstanceSerializer,
    PluginSerializer,
    PluginSourceCreateSerializer,
    PluginSourceSerializer,
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

        for datasource_class in plugin_class.get_datasources():
            comp_meta = datasource_class.get_meta()
            PluginComponent.objects.create(
                plugin=plugin,
                component_type=PluginComponent.COMPONENT_TYPE_DATASOURCE,
                slug=comp_meta.slug,
                name=comp_meta.name,
                description=comp_meta.description,
                python_path=f"{datasource_class.__module__}.{datasource_class.__name__}",
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

    @action(detail=False, methods=['post'], url_path='install-dependencies')
    def install_dependencies(self, request):
        """
        Install dependencies for a plugin.

        Request body:
        {
            "slug": "plugin-slug",  // Plugin to install dependencies for
            "packages": ["httpx", "boto3"]  // Optional: specific packages to install
        }
        """
        slug = request.data.get('slug')
        packages = request.data.get('packages')

        if not slug:
            return Response(
                {'detail': 'Plugin slug is required'},
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
        dependencies = getattr(meta, 'dependencies', []) or []

        if not dependencies:
            return Response({
                'success': True,
                'message': 'Plugin has no dependencies',
                'installed': [],
                'failed': [],
            })

        # If specific packages requested, filter to only those
        if packages:
            # Match packages by name (ignoring version specifiers)
            packages_to_install = []
            for dep in dependencies:
                dep_name = dep.split('>=')[0].split('<=')[0].split('==')[0].split('[')[0].strip()
                if dep_name in packages:
                    packages_to_install.append(dep)
        else:
            # Install all missing dependencies
            dep_statuses = check_dependencies(dependencies)
            packages_to_install = [s.package for s in dep_statuses if not s.satisfied]

        if not packages_to_install:
            return Response({
                'success': True,
                'message': 'All dependencies are already satisfied',
                'installed': [],
                'failed': [],
            })

        # Install the dependencies
        result = install_dependencies(packages_to_install)

        return Response({
            'success': result['success'],
            'message': result['output'],
            'installed': result['installed'],
            'failed': result['failed'],
        })

    @action(detail=False, methods=['post'], url_path='check-dependencies')
    def check_plugin_dependencies(self, request):
        """
        Check dependencies for a plugin without installing.

        Request body:
        {
            "slug": "plugin-slug"
        }
        """
        slug = request.data.get('slug')

        if not slug:
            return Response(
                {'detail': 'Plugin slug is required'},
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
        dependencies = getattr(meta, 'dependencies', []) or []

        if not dependencies:
            return Response({
                'dependencies': [],
                'missing': [],
                'satisfied': True,
            })

        dep_statuses = check_dependencies(dependencies)
        missing = [s.package for s in dep_statuses if not s.satisfied]

        serializer = DependencyStatusSerializer(dep_statuses, many=True)

        return Response({
            'dependencies': serializer.data,
            'missing': missing,
            'satisfied': len(missing) == 0,
        })

    @action(detail=False, methods=['post'], url_path='check-updates')
    def check_updates(self, request):
        """
        Check all installed plugins for updates.
        """
        from plugins.source_manager import PluginSourceManager

        manager = PluginSourceManager()
        updates = []

        # Only check plugins that have a source
        plugins = Plugin.objects.filter(source__isnull=False, enabled=True)

        for plugin in plugins:
            available = manager.check_for_updates(plugin)
            if available:
                updates.append({
                    'slug': plugin.slug,
                    'name': plugin.name,
                    'current_version': plugin.installed_version,
                    'available_version': available,
                })

        return Response({
            'updates_available': len(updates),
            'plugins': updates,
        })

    @action(detail=True, methods=['post'], url_path='check-update')
    def check_update(self, request, slug=None):
        """
        Check a single plugin for updates.
        """
        plugin = self.get_object()

        if not plugin.source:
            return Response({
                'update_available': False,
                'message': 'Plugin was not installed from a source',
            })

        from plugins.source_manager import PluginSourceManager

        manager = PluginSourceManager()
        available = manager.check_for_updates(plugin)

        return Response({
            'update_available': available is not None,
            'current_version': plugin.installed_version,
            'available_version': available or plugin.installed_version,
        })

    @action(detail=True, methods=['post'], url_path='apply-update')
    def apply_update(self, request, slug=None):
        """
        Update a plugin to the latest version.
        """
        plugin = self.get_object()

        if not plugin.source:
            return Response(
                {'detail': 'Plugin was not installed from a source and cannot be updated'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from plugins.source_manager import PluginSourceManager, PluginSourceError

        manager = PluginSourceManager()

        try:
            updated = manager.update_plugin(plugin)
            if updated:
                plugin.refresh_from_db()
                return Response({
                    'success': True,
                    'message': f'Updated {plugin.name} to v{plugin.version}',
                    'version': plugin.version,
                })
            else:
                return Response({
                    'success': True,
                    'message': 'Plugin is already at the latest version',
                    'version': plugin.version,
                })
        except PluginSourceError as e:
            return Response(
                {'success': False, 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


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

    @action(detail=False, methods=['get'])
    def datasources(self, request):
        """List all data source components."""
        queryset = self.get_queryset().filter(
            component_type=PluginComponent.COMPONENT_TYPE_DATASOURCE
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
        Run an importer or data source instance manually.

        Works for importer and data source instances.
        """
        instance = self.get_object()

        if instance.component.component_type == PluginComponent.COMPONENT_TYPE_IMPORTER:
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
        elif instance.component.component_type == PluginComponent.COMPONENT_TYPE_DATASOURCE:
            if not instance.affinda_data_source:
                return Response(
                    {'detail': 'Data source instance has no Affinda data source configured'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            try:
                result = execute_datasource(instance)
                return Response({
                    'success': result.success,
                    'records_synced': result.records_synced,
                    'records_created': result.records_created,
                    'records_updated': result.records_updated,
                    'records_failed': result.records_failed,
                    'errors': result.errors,
                    'message': result.message,
                })
            except Exception as e:
                return Response(
                    {'success': False, 'detail': str(e)},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
        else:
            return Response(
                {'detail': 'Only importer and data source instances can be run manually'},
                status=status.HTTP_400_BAD_REQUEST
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

    @action(detail=False, methods=['get'])
    def datasources(self, request):
        """List all data source instances."""
        queryset = self.get_queryset().filter(
            component__component_type=PluginComponent.COMPONENT_TYPE_DATASOURCE
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


class PluginSourceViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing plugin sources.
    """
    queryset = PluginSource.objects.all()
    serializer_class = PluginSourceSerializer
    lookup_field = 'slug'

    def get_serializer_class(self):
        if self.action == 'create':
            return PluginSourceCreateSerializer
        return PluginSourceSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        # Filter by source type
        source_type = self.request.query_params.get('type')
        if source_type:
            queryset = queryset.filter(source_type=source_type)

        # Filter by enabled status
        enabled = self.request.query_params.get('enabled')
        if enabled is not None:
            queryset = queryset.filter(enabled=enabled.lower() == 'true')

        return queryset

    def create(self, request, *args, **kwargs):
        """
        Add a new plugin source URL.

        Request body:
        {
            "url": "https://github.com/user/repo",
            "name": "Optional Name"
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        url = serializer.validated_data['url']
        name = serializer.validated_data.get('name', '')

        # Generate slug from URL
        from urllib.parse import urlparse
        parsed = urlparse(url)
        path_parts = parsed.path.strip('/').split('/')
        if len(path_parts) >= 2:
            # GitHub-style URL: use owner-repo
            slug_base = f"{path_parts[0]}-{path_parts[1]}"
        else:
            slug_base = path_parts[-1] if path_parts else 'source'

        slug = slugify(slug_base)

        # Ensure uniqueness
        if PluginSource.objects.filter(slug=slug).exists():
            counter = 1
            while PluginSource.objects.filter(slug=f"{slug}-{counter}").exists():
                counter += 1
            slug = f"{slug}-{counter}"

        # Check if URL already exists
        if PluginSource.objects.filter(url=url).exists():
            return Response(
                {'detail': f'A source with this URL already exists'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create the source
        source = PluginSource.objects.create(
            slug=slug,
            name=name or slug_base.replace('-', ' ').replace('_', ' ').title(),
            url=url,
            source_type=PluginSource.SOURCE_TYPE_USER,
        )

        # Try to fetch the manifest
        from plugins.source_manager import PluginSourceManager, PluginSourceError
        manager = PluginSourceManager()
        try:
            manager.fetch_source(source)
        except PluginSourceError as e:
            # Source created but couldn't fetch manifest
            source.error_message = str(e)
            source.save()

        output_serializer = PluginSourceSerializer(source)
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    def destroy(self, request, *args, **kwargs):
        """
        Delete a user-added source.
        Built-in sources cannot be deleted.
        """
        source = self.get_object()

        if source.source_type == PluginSource.SOURCE_TYPE_BUILTIN:
            return Response(
                {'detail': 'Built-in sources cannot be deleted. You can disable them instead.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Note: Plugins installed from this source will remain but be orphaned
        source.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def toggle(self, request, slug=None):
        """
        Toggle a source's enabled status.
        """
        source = self.get_object()
        source.enabled = not source.enabled
        source.save()
        return Response({'enabled': source.enabled})

    @action(detail=True, methods=['post'])
    def refresh(self, request, slug=None):
        """
        Fetch the latest manifest from the source.
        """
        source = self.get_object()

        from plugins.source_manager import PluginSourceManager, PluginSourceError
        manager = PluginSourceManager()

        try:
            manifest = manager.fetch_source(source)
            available_plugins = manager.get_available_plugins(source)
            return Response({
                'success': True,
                'is_multi_plugin': source.is_multi_plugin,
                'plugins_count': len(available_plugins),
                'available_plugins': available_plugins,
            })
        except PluginSourceError as e:
            return Response(
                {'success': False, 'detail': str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'], url_path='install/(?P<plugin_slug>[^/.]+)')
    def install_plugin(self, request, slug=None, plugin_slug=None):
        """
        Install a plugin from this source.

        URL: /api/plugin-sources/{source-slug}/install/{plugin-slug}/
        """
        source = self.get_object()

        if not source.enabled:
            return Response(
                {'detail': 'Cannot install from a disabled source'},
                status=status.HTTP_400_BAD_REQUEST
            )

        from plugins.source_manager import PluginSourceManager, PluginSourceError
        manager = PluginSourceManager()

        try:
            plugin = manager.install_plugin(source, plugin_slug)
            return Response({
                'success': True,
                'plugin': {
                    'id': plugin.id,
                    'slug': plugin.slug,
                    'name': plugin.name,
                    'version': plugin.version,
                },
                'message': f'Successfully installed {plugin.name} v{plugin.version}',
            }, status=status.HTTP_201_CREATED)
        except PluginSourceError as e:
            return Response(
                {'success': False, 'detail': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=True, methods=['get'])
    def available(self, request, slug=None):
        """
        List available plugins from this source.
        """
        source = self.get_object()

        from plugins.source_manager import PluginSourceManager
        manager = PluginSourceManager()

        # Refresh if never fetched
        if not source.manifest_data:
            from plugins.source_manager import PluginSourceError
            try:
                manager.fetch_source(source)
            except PluginSourceError as e:
                return Response(
                    {'detail': f'Could not fetch source: {e}'},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        available_plugins = manager.get_available_plugins(source)
        return Response({
            'source': source.slug,
            'plugins': available_plugins,
        })
