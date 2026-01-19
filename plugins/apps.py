import logging

from django.apps import AppConfig

logger = logging.getLogger(__name__)


class PluginsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'plugins'
    verbose_name = 'Plugin System'

    def ready(self):
        # Import signals to register them
        from plugins import signals  # noqa: F401

        # Discover and load plugins from settings/entry points
        from plugins.registry import plugin_registry
        plugin_registry.autodiscover()

        # Ensure default plugin sources exist in database
        # Only run when not in migration mode
        import sys
        if 'migrate' not in sys.argv and 'makemigrations' not in sys.argv:
            try:
                from plugins.default_sources import ensure_default_sources
                ensure_default_sources()
            except Exception as e:
                logger.warning(f"Could not initialize default sources: {e}")

            # Load installed URL-based plugins
            try:
                from plugins.source_manager import PluginSourceManager
                manager = PluginSourceManager()
                manager.load_installed_plugins()
            except Exception as e:
                logger.warning(f"Could not load URL-based plugins: {e}")
