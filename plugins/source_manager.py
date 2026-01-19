"""
Plugin Source Manager - Core service for managing plugin sources and installations.
Handles fetching manifests, installing plugins, and checking for updates.
"""

import logging
import shutil
from pathlib import Path
from typing import Any, Optional

from django.conf import settings
from django.utils import timezone

from plugins.models import Plugin, PluginComponent, PluginSource
from plugins.url_handlers import (
    MULTI_PLUGIN_MANIFEST,
    SINGLE_PLUGIN_MANIFEST,
    GitHubHandler,
    DirectURLHandler,
    get_handler_for_url,
)

logger = logging.getLogger(__name__)


class PluginSourceError(Exception):
    """Base exception for plugin source operations."""
    pass


class PluginSourceManager:
    """
    Manages plugin sources - fetching manifests, installing plugins, and updates.
    """

    def __init__(self):
        self.cache_dir = self._get_cache_dir()
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _get_cache_dir(self) -> Path:
        """Get the plugin cache directory from settings."""
        cache_dir = getattr(settings, 'PLUGIN_CACHE_DIR', None)
        if cache_dir:
            return Path(cache_dir)
        return Path(settings.BASE_DIR) / 'plugins' / '.cache'

    def _get_source_cache_dir(self, source: PluginSource) -> Path:
        """Get the cache directory for a specific source."""
        return self.cache_dir / source.slug

    def _get_plugin_cache_dir(self, source: PluginSource, plugin_slug: str) -> Path:
        """Get the cache directory for a specific plugin."""
        return self._get_source_cache_dir(source) / plugin_slug

    def fetch_source(self, source: PluginSource) -> dict[str, Any]:
        """
        Fetch and parse a plugin source, updating the source's manifest_data.

        Args:
            source: The PluginSource to fetch

        Returns:
            Parsed manifest data

        Raises:
            PluginSourceError: If fetching fails
        """
        logger.info(f"Fetching source: {source.name} ({source.url})")

        handler, handler_type = get_handler_for_url(source.url)

        if handler_type == 'unknown':
            raise PluginSourceError(f"Unsupported URL format: {source.url}")

        try:
            if isinstance(handler, GitHubHandler):
                manifest = handler.fetch_manifest(source.url)
            else:
                # Direct URL - download and look for manifest
                raise PluginSourceError("Direct URL sources not yet supported for manifest fetching")

            if not manifest:
                raise PluginSourceError(f"No plugin manifest found at {source.url}")

            # Determine if multi-plugin or single-plugin
            manifest_type = manifest.get('_manifest_type', 'unknown')
            source.is_multi_plugin = manifest_type == 'multi'

            # Store manifest data
            source.manifest_data = manifest
            source.latest_version = manifest.get('version', '')
            source.last_fetched_at = timezone.now()
            source.last_checked_at = timezone.now()
            source.error_message = ''
            source.save()

            logger.info(f"Successfully fetched source {source.name}: {manifest_type} manifest")
            return manifest

        except Exception as e:
            source.error_message = str(e)
            source.last_checked_at = timezone.now()
            source.save()
            raise PluginSourceError(f"Failed to fetch source: {e}") from e

    def get_available_plugins(self, source: PluginSource) -> list[dict[str, Any]]:
        """
        Get list of plugins available from a source.

        Args:
            source: The PluginSource to query

        Returns:
            List of plugin metadata dictionaries
        """
        manifest = source.manifest_data
        if not manifest:
            return []

        manifest_type = manifest.get('_manifest_type', 'unknown')

        if manifest_type == 'multi':
            # Multi-plugin repo - return the plugins list
            plugins = manifest.get('plugins', [])
            # Add installed status
            for plugin in plugins:
                installed = Plugin.objects.filter(
                    source=source,
                    slug__endswith=plugin.get('slug', '')
                ).first()
                plugin['installed'] = installed is not None
                if installed:
                    plugin['installed_version'] = installed.installed_version
            return plugins

        elif manifest_type in ('single', 'inferred'):
            # Single plugin - return as a list of one
            plugin = {
                'slug': manifest.get('slug', ''),
                'name': manifest.get('name', manifest.get('slug', '')),
                'version': manifest.get('version', ''),
                'description': manifest.get('description', ''),
                'entry_point': manifest.get('entry_point', 'plugin.py'),
                'path': '',  # Root of repo
            }
            installed = Plugin.objects.filter(
                source=source
            ).first()
            plugin['installed'] = installed is not None
            if installed:
                plugin['installed_version'] = installed.installed_version
            return [plugin]

        return []

    def install_plugin(
        self,
        source: PluginSource,
        plugin_slug: str
    ) -> Plugin:
        """
        Install a plugin from a source.

        Args:
            source: The source to install from
            plugin_slug: The slug of the plugin to install (from manifest)

        Returns:
            The installed Plugin instance

        Raises:
            PluginSourceError: If installation fails
        """
        logger.info(f"Installing plugin {plugin_slug} from source {source.name}")

        # Get plugin info from manifest
        available = self.get_available_plugins(source)
        plugin_info = next((p for p in available if p.get('slug') == plugin_slug), None)

        if not plugin_info:
            raise PluginSourceError(f"Plugin '{plugin_slug}' not found in source '{source.name}'")

        # Check if already installed
        full_slug = f"{source.slug}.{plugin_slug}"
        existing = Plugin.objects.filter(slug=full_slug).first()
        if existing:
            raise PluginSourceError(f"Plugin '{full_slug}' is already installed")

        # Download plugin files
        plugin_cache_dir = self._get_plugin_cache_dir(source, plugin_slug)
        if plugin_cache_dir.exists():
            shutil.rmtree(plugin_cache_dir)
        plugin_cache_dir.mkdir(parents=True, exist_ok=True)

        handler, handler_type = get_handler_for_url(source.url)

        if isinstance(handler, GitHubHandler):
            plugin_path = plugin_info.get('path', '')
            success = handler.download_directory(
                source.url,
                plugin_path,
                plugin_cache_dir
            )
            if not success:
                raise PluginSourceError(f"Failed to download plugin files for {plugin_slug}")
        else:
            raise PluginSourceError("Direct URL sources not yet supported for installation")

        # Load and register the plugin
        from plugins.dynamic_loader import load_plugin_from_path, PluginLoadError

        entry_point = plugin_info.get('entry_point', 'plugin.py')
        try:
            plugin_class = load_plugin_from_path(plugin_cache_dir, entry_point)
        except PluginLoadError as e:
            # Clean up on failure
            shutil.rmtree(plugin_cache_dir)
            raise PluginSourceError(f"Failed to load plugin: {e}") from e

        # Get plugin metadata
        meta = plugin_class.get_meta()

        # Create Plugin record
        plugin = Plugin.objects.create(
            slug=full_slug,
            name=meta.name,
            author=meta.author,
            version=meta.version,
            description=meta.description,
            python_path=f"{plugin_cache_dir.name}.{entry_point.rstrip('.py')}",
            enabled=True,
            config_schema=meta.config_schema,
            source=source,
            source_path=plugin_info.get('path', ''),
            installed_version=meta.version,
            installed_from_url=source.url,
        )

        # Register components
        self._register_plugin_components(plugin, plugin_class)

        # Register with the global registry
        from plugins.registry import plugin_registry
        plugin_registry.register_plugin(plugin_class)

        logger.info(f"Successfully installed plugin {full_slug} v{meta.version}")
        return plugin

    def _register_plugin_components(self, plugin: Plugin, plugin_class) -> None:
        """Register plugin components (importers, processors, etc.) in the database."""
        from plugins.base import ComponentMeta

        # Register importers
        for importer_class in plugin_class.get_importers():
            meta: ComponentMeta = importer_class.get_meta()
            PluginComponent.objects.create(
                plugin=plugin,
                component_type=PluginComponent.COMPONENT_TYPE_IMPORTER,
                slug=meta.slug,
                name=meta.name,
                description=meta.description,
                python_path=f"{plugin_class.__module__}.{importer_class.__name__}",
                config_schema=meta.config_schema,
            )

        # Register preprocessors
        for preprocessor_class in plugin_class.get_preprocessors():
            meta: ComponentMeta = preprocessor_class.get_meta()
            PluginComponent.objects.create(
                plugin=plugin,
                component_type=PluginComponent.COMPONENT_TYPE_PREPROCESSOR,
                slug=meta.slug,
                name=meta.name,
                description=meta.description,
                python_path=f"{plugin_class.__module__}.{preprocessor_class.__name__}",
                config_schema=meta.config_schema,
            )

        # Register postprocessors
        for postprocessor_class in plugin_class.get_postprocessors():
            meta: ComponentMeta = postprocessor_class.get_meta()
            PluginComponent.objects.create(
                plugin=plugin,
                component_type=PluginComponent.COMPONENT_TYPE_POSTPROCESSOR,
                slug=meta.slug,
                name=meta.name,
                description=meta.description,
                python_path=f"{plugin_class.__module__}.{postprocessor_class.__name__}",
                config_schema=meta.config_schema,
            )

        # Register data sources
        for datasource_class in plugin_class.get_datasources():
            meta: ComponentMeta = datasource_class.get_meta()
            PluginComponent.objects.create(
                plugin=plugin,
                component_type=PluginComponent.COMPONENT_TYPE_DATASOURCE,
                slug=meta.slug,
                name=meta.name,
                description=meta.description,
                python_path=f"{plugin_class.__module__}.{datasource_class.__name__}",
                config_schema=meta.config_schema,
            )

    def update_plugin(self, plugin: Plugin) -> bool:
        """
        Update an installed plugin to the latest version.

        Args:
            plugin: The Plugin to update

        Returns:
            True if updated, False if already at latest version

        Raises:
            PluginSourceError: If update fails
        """
        if not plugin.source:
            raise PluginSourceError("Plugin has no source - cannot update")

        # Refresh source manifest
        self.fetch_source(plugin.source)

        # Get available plugins
        available = self.get_available_plugins(plugin.source)
        plugin_slug = plugin.slug.split('.')[-1] if '.' in plugin.slug else plugin.slug
        plugin_info = next((p for p in available if p.get('slug') == plugin_slug), None)

        if not plugin_info:
            raise PluginSourceError(f"Plugin no longer available in source")

        available_version = plugin_info.get('version', '')
        if available_version == plugin.installed_version:
            logger.info(f"Plugin {plugin.slug} is already at latest version {available_version}")
            return False

        # Uninstall old version (keep database record)
        plugin_cache_dir = self._get_plugin_cache_dir(plugin.source, plugin_slug)
        if plugin_cache_dir.exists():
            shutil.rmtree(plugin_cache_dir)

        # Download new version
        handler, handler_type = get_handler_for_url(plugin.source.url)

        if isinstance(handler, GitHubHandler):
            plugin_path = plugin_info.get('path', '')
            success = handler.download_directory(
                plugin.source.url,
                plugin_path,
                plugin_cache_dir
            )
            if not success:
                raise PluginSourceError(f"Failed to download updated plugin files")
        else:
            raise PluginSourceError("Direct URL sources not yet supported")

        # Load the updated plugin
        from plugins.dynamic_loader import load_plugin_from_path, PluginLoadError

        entry_point = plugin_info.get('entry_point', 'plugin.py')
        try:
            plugin_class = load_plugin_from_path(plugin_cache_dir, entry_point)
        except PluginLoadError as e:
            raise PluginSourceError(f"Failed to load updated plugin: {e}") from e

        # Update plugin record
        meta = plugin_class.get_meta()
        plugin.version = meta.version
        plugin.installed_version = meta.version
        plugin.available_version = ''
        plugin.update_available = False
        plugin.description = meta.description
        plugin.config_schema = meta.config_schema
        plugin.save()

        # Update components
        plugin.components.all().delete()
        self._register_plugin_components(plugin, plugin_class)

        # Re-register with global registry
        from plugins.registry import plugin_registry
        plugin_registry.register_plugin(plugin_class)

        logger.info(f"Successfully updated plugin {plugin.slug} to v{meta.version}")
        return True

    def uninstall_plugin(self, plugin: Plugin) -> bool:
        """
        Uninstall a plugin.

        Args:
            plugin: The Plugin to uninstall

        Returns:
            True if uninstalled successfully
        """
        logger.info(f"Uninstalling plugin {plugin.slug}")

        # Remove from global registry
        from plugins.registry import plugin_registry
        plugin_registry.unregister_plugin(plugin.slug)

        # Remove cached files
        if plugin.source:
            plugin_slug = plugin.slug.split('.')[-1] if '.' in plugin.slug else plugin.slug
            plugin_cache_dir = self._get_plugin_cache_dir(plugin.source, plugin_slug)
            if plugin_cache_dir.exists():
                shutil.rmtree(plugin_cache_dir)

        # Delete database records (cascades to components and instances)
        plugin.delete()

        logger.info(f"Successfully uninstalled plugin {plugin.slug}")
        return True

    def check_for_updates(self, plugin: Plugin) -> Optional[str]:
        """
        Check if an update is available for a plugin.

        Args:
            plugin: The Plugin to check

        Returns:
            Available version string if update available, None otherwise
        """
        if not plugin.source:
            return None

        # Refresh source manifest
        try:
            self.fetch_source(plugin.source)
        except PluginSourceError:
            return None

        # Get available plugins
        available = self.get_available_plugins(plugin.source)
        plugin_slug = plugin.slug.split('.')[-1] if '.' in plugin.slug else plugin.slug
        plugin_info = next((p for p in available if p.get('slug') == plugin_slug), None)

        if not plugin_info:
            return None

        available_version = plugin_info.get('version', '')
        if available_version and available_version != plugin.installed_version:
            plugin.available_version = available_version
            plugin.update_available = True
            plugin.save()
            return available_version

        plugin.update_available = False
        plugin.available_version = ''
        plugin.save()
        return None

    def load_installed_plugins(self) -> None:
        """
        Load all installed URL-based plugins on startup.
        Called during app initialization.
        """
        from plugins.dynamic_loader import load_plugin_from_path, PluginLoadError
        from plugins.registry import plugin_registry

        plugins = Plugin.objects.filter(source__isnull=False, enabled=True)

        for plugin in plugins:
            if not plugin.source:
                continue

            plugin_slug = plugin.slug.split('.')[-1] if '.' in plugin.slug else plugin.slug
            plugin_cache_dir = self._get_plugin_cache_dir(plugin.source, plugin_slug)

            if not plugin_cache_dir.exists():
                logger.warning(f"Cache directory missing for plugin {plugin.slug}")
                continue

            # Determine entry point
            available = self.get_available_plugins(plugin.source)
            plugin_info = next((p for p in available if p.get('slug') == plugin_slug), None)
            entry_point = plugin_info.get('entry_point', 'plugin.py') if plugin_info else 'plugin.py'

            try:
                plugin_class = load_plugin_from_path(plugin_cache_dir, entry_point)
                plugin_registry.register_plugin(plugin_class)
                logger.info(f"Loaded installed plugin: {plugin.slug}")
            except PluginLoadError as e:
                logger.error(f"Failed to load plugin {plugin.slug}: {e}")
