"""
Plugin update checker service.
Provides functions to check for plugin updates from their sources.
"""

import logging
from typing import Optional

from django.utils import timezone

from plugins.models import Plugin, PluginSource

logger = logging.getLogger(__name__)


def check_all_sources_for_updates() -> dict:
    """
    Check all enabled sources for updates to installed plugins.

    Returns:
        Dictionary with update information:
        {
            'checked_at': datetime,
            'sources_checked': int,
            'plugins_checked': int,
            'updates_available': [
                {
                    'slug': str,
                    'name': str,
                    'current_version': str,
                    'available_version': str,
                    'source': str,
                }
            ]
        }
    """
    from plugins.source_manager import PluginSourceManager, PluginSourceError

    manager = PluginSourceManager()
    updates = []
    sources_checked = 0
    plugins_checked = 0

    # Get all enabled sources
    sources = PluginSource.objects.filter(enabled=True)

    for source in sources:
        try:
            # Refresh the source manifest
            manager.fetch_source(source)
            sources_checked += 1
        except PluginSourceError as e:
            logger.warning(f"Failed to fetch source {source.slug}: {e}")
            continue

        # Check plugins installed from this source
        plugins = Plugin.objects.filter(source=source, enabled=True)
        for plugin in plugins:
            plugins_checked += 1
            available = manager.check_for_updates(plugin)
            if available:
                updates.append({
                    'slug': plugin.slug,
                    'name': plugin.name,
                    'current_version': plugin.installed_version,
                    'available_version': available,
                    'source': source.name,
                })

    return {
        'checked_at': timezone.now().isoformat(),
        'sources_checked': sources_checked,
        'plugins_checked': plugins_checked,
        'updates_available': updates,
    }


def check_source_for_updates(source: PluginSource) -> list[dict]:
    """
    Check a single source for updates to its installed plugins.

    Args:
        source: The PluginSource to check

    Returns:
        List of update information dictionaries
    """
    from plugins.source_manager import PluginSourceManager, PluginSourceError

    manager = PluginSourceManager()
    updates = []

    try:
        # Refresh the source manifest
        manager.fetch_source(source)
    except PluginSourceError as e:
        logger.warning(f"Failed to fetch source {source.slug}: {e}")
        return []

    # Check plugins installed from this source
    plugins = Plugin.objects.filter(source=source, enabled=True)
    for plugin in plugins:
        available = manager.check_for_updates(plugin)
        if available:
            updates.append({
                'slug': plugin.slug,
                'name': plugin.name,
                'current_version': plugin.installed_version,
                'available_version': available,
            })

    return updates


def check_plugin_for_update(plugin: Plugin) -> Optional[str]:
    """
    Check a single plugin for updates.

    Args:
        plugin: The Plugin to check

    Returns:
        Available version string if update available, None otherwise
    """
    if not plugin.source:
        return None

    from plugins.source_manager import PluginSourceManager

    manager = PluginSourceManager()
    return manager.check_for_updates(plugin)


def get_plugins_with_updates() -> list[Plugin]:
    """
    Get all plugins that have updates available.

    Returns:
        List of Plugin instances with update_available=True
    """
    return list(Plugin.objects.filter(update_available=True, enabled=True))


def update_all_plugins() -> dict:
    """
    Update all plugins that have updates available.

    Returns:
        Dictionary with results:
        {
            'updated': [{'slug': str, 'version': str}],
            'failed': [{'slug': str, 'error': str}],
        }
    """
    from plugins.source_manager import PluginSourceManager, PluginSourceError

    manager = PluginSourceManager()
    updated = []
    failed = []

    plugins = get_plugins_with_updates()

    for plugin in plugins:
        try:
            if manager.update_plugin(plugin):
                plugin.refresh_from_db()
                updated.append({
                    'slug': plugin.slug,
                    'version': plugin.version,
                })
        except PluginSourceError as e:
            failed.append({
                'slug': plugin.slug,
                'error': str(e),
            })

    return {
        'updated': updated,
        'failed': failed,
    }
