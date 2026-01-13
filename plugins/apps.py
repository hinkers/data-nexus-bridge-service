from django.apps import AppConfig


class PluginsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'plugins'
    verbose_name = 'Plugin System'

    def ready(self):
        # Import signals to register them
        from plugins import signals  # noqa: F401
        # Discover and load plugins
        from plugins.registry import plugin_registry
        plugin_registry.autodiscover()
