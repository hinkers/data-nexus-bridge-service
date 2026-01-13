"""
Plugin registry for discovering and managing plugins.
"""
import importlib
import logging
from typing import TYPE_CHECKING

from django.conf import settings

if TYPE_CHECKING:
    from plugins.base import BasePlugin, BaseImporter, BasePreProcessor, BasePostProcessor

logger = logging.getLogger(__name__)


class PluginRegistry:
    """
    Central registry for all plugins and their components.

    The registry is responsible for:
    - Discovering plugins from configured paths
    - Loading and validating plugin classes
    - Providing access to plugin components
    """

    def __init__(self):
        self._plugins: dict[str, type["BasePlugin"]] = {}
        self._importers: dict[str, type["BaseImporter"]] = {}
        self._preprocessors: dict[str, type["BasePreProcessor"]] = {}
        self._postprocessors: dict[str, type["BasePostProcessor"]] = {}
        self._discovered = False

    def autodiscover(self) -> None:
        """
        Discover and register all plugins from configured paths.

        Looks for plugins in:
        1. PLUGIN_MODULES setting (list of module paths)
        2. Entry points (for pip-installed plugins)
        """
        if self._discovered:
            return

        # Discover from settings
        plugin_modules = getattr(settings, 'PLUGIN_MODULES', [])
        for module_path in plugin_modules:
            try:
                self._load_plugin_module(module_path)
            except Exception as e:
                logger.error(f"Failed to load plugin module {module_path}: {e}")

        # Discover from entry points
        try:
            self._discover_entry_points()
        except Exception as e:
            logger.error(f"Failed to discover entry points: {e}")

        self._discovered = True
        logger.info(
            f"Plugin discovery complete: {len(self._plugins)} plugins, "
            f"{len(self._importers)} importers, "
            f"{len(self._preprocessors)} pre-processors, "
            f"{len(self._postprocessors)} post-processors"
        )

    def _load_plugin_module(self, module_path: str) -> None:
        """Load a plugin from a module path."""
        from plugins.base import BasePlugin, PluginMeta

        try:
            module = importlib.import_module(module_path)

            # Look for a Plugin class in the module
            for attr_name in dir(module):
                attr = getattr(module, attr_name)
                if (
                    isinstance(attr, type)
                    and issubclass(attr, BasePlugin)
                    and attr is not BasePlugin
                    and hasattr(attr, 'get_meta')
                ):
                    # Check if it's a plugin class by verifying get_meta returns PluginMeta
                    try:
                        meta = attr.get_meta()
                        if isinstance(meta, PluginMeta) and meta.slug:
                            self.register_plugin(attr)
                    except (TypeError, AttributeError):
                        continue

        except ImportError as e:
            logger.error(f"Failed to import plugin module {module_path}: {e}")
            raise

    def _discover_entry_points(self) -> None:
        """Discover plugins from setuptools entry points."""
        try:
            from importlib.metadata import entry_points
            eps = entry_points()

            # Look for 'datanexus.plugins' entry point group
            plugin_eps = eps.get('datanexus.plugins', [])
            if hasattr(eps, 'select'):  # Python 3.10+
                plugin_eps = eps.select(group='datanexus.plugins')

            for ep in plugin_eps:
                try:
                    plugin_class = ep.load()
                    self.register_plugin(plugin_class)
                    logger.info(f"Loaded plugin from entry point: {ep.name}")
                except Exception as e:
                    logger.error(f"Failed to load plugin from entry point {ep.name}: {e}")

        except Exception as e:
            logger.debug(f"Entry point discovery not available: {e}")

    def register_plugin(self, plugin_class: type["BasePlugin"]) -> None:
        """
        Register a plugin and all its components.

        Args:
            plugin_class: The plugin class to register
        """
        meta = plugin_class.get_meta()
        plugin_slug = meta.slug

        if plugin_slug in self._plugins:
            logger.warning(f"Plugin {plugin_slug} already registered, skipping")
            return

        self._plugins[plugin_slug] = plugin_class
        logger.info(f"Registered plugin: {meta.name} v{meta.version} ({plugin_slug})")

        # Register importers
        for importer_class in plugin_class.get_importers():
            importer_meta = importer_class.get_meta()
            full_slug = f"{plugin_slug}.{importer_meta.slug}"
            self._importers[full_slug] = importer_class
            logger.debug(f"  Registered importer: {importer_meta.name} ({full_slug})")

        # Register pre-processors
        for preprocessor_class in plugin_class.get_preprocessors():
            preprocessor_meta = preprocessor_class.get_meta()
            full_slug = f"{plugin_slug}.{preprocessor_meta.slug}"
            self._preprocessors[full_slug] = preprocessor_class
            logger.debug(f"  Registered pre-processor: {preprocessor_meta.name} ({full_slug})")

        # Register post-processors
        for postprocessor_class in plugin_class.get_postprocessors():
            postprocessor_meta = postprocessor_class.get_meta()
            full_slug = f"{plugin_slug}.{postprocessor_meta.slug}"
            self._postprocessors[full_slug] = postprocessor_class
            logger.debug(f"  Registered post-processor: {postprocessor_meta.name} ({full_slug})")

    def get_plugin(self, slug: str) -> type["BasePlugin"] | None:
        """Get a plugin class by slug."""
        return self._plugins.get(slug)

    def get_importer(self, full_slug: str) -> type["BaseImporter"] | None:
        """Get an importer class by full slug (plugin.component)."""
        return self._importers.get(full_slug)

    def get_preprocessor(self, full_slug: str) -> type["BasePreProcessor"] | None:
        """Get a pre-processor class by full slug."""
        return self._preprocessors.get(full_slug)

    def get_postprocessor(self, full_slug: str) -> type["BasePostProcessor"] | None:
        """Get a post-processor class by full slug."""
        return self._postprocessors.get(full_slug)

    def list_plugins(self) -> list[dict]:
        """List all registered plugins with their metadata."""
        result = []
        for slug, plugin_class in self._plugins.items():
            meta = plugin_class.get_meta()
            result.append({
                'slug': meta.slug,
                'name': meta.name,
                'version': meta.version,
                'author': meta.author,
                'description': meta.description,
                'config_schema': meta.config_schema,
                'importers': [
                    {
                        'slug': f"{slug}.{imp.get_meta().slug}",
                        'name': imp.get_meta().name,
                        'description': imp.get_meta().description,
                        'config_schema': imp.get_meta().config_schema,
                    }
                    for imp in plugin_class.get_importers()
                ],
                'preprocessors': [
                    {
                        'slug': f"{slug}.{pre.get_meta().slug}",
                        'name': pre.get_meta().name,
                        'description': pre.get_meta().description,
                        'config_schema': pre.get_meta().config_schema,
                    }
                    for pre in plugin_class.get_preprocessors()
                ],
                'postprocessors': [
                    {
                        'slug': f"{slug}.{post.get_meta().slug}",
                        'name': post.get_meta().name,
                        'description': post.get_meta().description,
                        'config_schema': post.get_meta().config_schema,
                        'supported_events': post.get_supported_events(),
                    }
                    for post in plugin_class.get_postprocessors()
                ],
            })
        return result

    def list_importers(self) -> list[dict]:
        """List all registered importers."""
        result = []
        for full_slug, importer_class in self._importers.items():
            meta = importer_class.get_meta()
            result.append({
                'slug': full_slug,
                'name': meta.name,
                'description': meta.description,
                'config_schema': meta.config_schema,
            })
        return result

    def list_preprocessors(self) -> list[dict]:
        """List all registered pre-processors."""
        result = []
        for full_slug, preprocessor_class in self._preprocessors.items():
            meta = preprocessor_class.get_meta()
            result.append({
                'slug': full_slug,
                'name': meta.name,
                'description': meta.description,
                'config_schema': meta.config_schema,
            })
        return result

    def list_postprocessors(self) -> list[dict]:
        """List all registered post-processors."""
        result = []
        for full_slug, postprocessor_class in self._postprocessors.items():
            meta = postprocessor_class.get_meta()
            result.append({
                'slug': full_slug,
                'name': meta.name,
                'description': meta.description,
                'config_schema': meta.config_schema,
                'supported_events': postprocessor_class.get_supported_events(),
            })
        return result


# Global registry instance
plugin_registry = PluginRegistry()
