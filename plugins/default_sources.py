"""
Default plugin sources that ship with the application.
These are built-in sources that cannot be removed, only disabled.
"""

import logging

from django.conf import settings

logger = logging.getLogger(__name__)


# Default plugin sources shipped with the application
# Users can add their own sources, but cannot remove these
DEFAULT_PLUGIN_SOURCES = [
    # You can add official/default plugin sources here
    # Example:
    # {
    #     'slug': 'datanexus-official',
    #     'name': 'DataNexus Official Plugins',
    #     'url': 'https://github.com/datanexus/official-plugins',
    #     'source_type': 'builtin',
    # },
]


def get_configured_sources() -> list[dict]:
    """
    Get the list of configured plugin sources.
    Combines DEFAULT_PLUGIN_SOURCES with any sources defined in settings.
    """
    sources = list(DEFAULT_PLUGIN_SOURCES)

    # Add sources from settings
    settings_sources = getattr(settings, 'DEFAULT_PLUGIN_SOURCES', [])
    for source in settings_sources:
        # Ensure source_type is set to builtin for settings-defined sources
        source = dict(source)
        source['source_type'] = 'builtin'
        sources.append(source)

    return sources


def ensure_default_sources() -> None:
    """
    Ensure all default plugin sources exist in the database.
    Called during app initialization.
    """
    # Import here to avoid circular imports
    from plugins.models import PluginSource

    sources = get_configured_sources()

    for source_data in sources:
        slug = source_data.get('slug')
        if not slug:
            logger.warning(f"Skipping source without slug: {source_data}")
            continue

        try:
            source, created = PluginSource.objects.get_or_create(
                slug=slug,
                defaults={
                    'name': source_data.get('name', slug),
                    'url': source_data.get('url', ''),
                    'source_type': PluginSource.SOURCE_TYPE_BUILTIN,
                    'enabled': source_data.get('enabled', True),
                }
            )

            if created:
                logger.info(f"Created default plugin source: {source.name}")
            else:
                # Update URL if it changed (but don't change user settings)
                if source.source_type == PluginSource.SOURCE_TYPE_BUILTIN:
                    new_url = source_data.get('url', '')
                    if new_url and source.url != new_url:
                        source.url = new_url
                        source.save(update_fields=['url'])
                        logger.info(f"Updated URL for source {source.name}")

        except Exception as e:
            logger.error(f"Failed to create/update source {slug}: {e}")


def cleanup_orphaned_builtin_sources() -> None:
    """
    Remove built-in sources that are no longer in the default list.
    Called during app initialization.
    """
    from plugins.models import PluginSource

    configured_slugs = {s['slug'] for s in get_configured_sources()}

    # Find built-in sources not in the current config
    orphaned = PluginSource.objects.filter(
        source_type=PluginSource.SOURCE_TYPE_BUILTIN
    ).exclude(
        slug__in=configured_slugs
    )

    for source in orphaned:
        # Check if there are installed plugins from this source
        if source.plugins.exists():
            logger.warning(
                f"Built-in source '{source.name}' is no longer configured but has "
                f"installed plugins. Converting to user source."
            )
            source.source_type = PluginSource.SOURCE_TYPE_USER
            source.save(update_fields=['source_type'])
        else:
            logger.info(f"Removing orphaned built-in source: {source.name}")
            source.delete()
