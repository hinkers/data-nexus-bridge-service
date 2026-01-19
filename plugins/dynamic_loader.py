"""
Dynamic Module Loader - Load plugin classes from filesystem paths at runtime.
"""

import importlib.util
import inspect
import logging
import sys
from pathlib import Path
from typing import Optional

from plugins.base import BasePlugin

logger = logging.getLogger(__name__)


class PluginLoadError(Exception):
    """Exception raised when plugin loading fails."""
    pass


def load_plugin_from_path(plugin_path: Path, entry_point: str) -> type[BasePlugin]:
    """
    Dynamically load a plugin class from a filesystem path.

    Args:
        plugin_path: Path to the plugin directory
        entry_point: Filename of the main plugin module (e.g., 'plugin.py')

    Returns:
        The plugin class (subclass of BasePlugin)

    Raises:
        PluginLoadError: If loading fails
    """
    plugin_path = Path(plugin_path)
    module_file = plugin_path / entry_point

    if not module_file.exists():
        raise PluginLoadError(f"Entry point not found: {module_file}")

    logger.debug(f"Loading plugin from {module_file}")

    # Generate a unique module name to avoid conflicts
    module_name = f"_dynamic_plugin_{plugin_path.name}_{entry_point.rstrip('.py')}"

    # Check if module is already loaded
    if module_name in sys.modules:
        del sys.modules[module_name]

    try:
        # Load the module from the file path
        spec = importlib.util.spec_from_file_location(module_name, module_file)
        if spec is None or spec.loader is None:
            raise PluginLoadError(f"Could not create module spec for {module_file}")

        module = importlib.util.module_from_spec(spec)

        # Add the plugin directory to sys.path temporarily so imports work
        plugin_dir_str = str(plugin_path)
        if plugin_dir_str not in sys.path:
            sys.path.insert(0, plugin_dir_str)

        try:
            # Register the module in sys.modules before executing
            sys.modules[module_name] = module

            # Execute the module
            spec.loader.exec_module(module)

            # Find the BasePlugin subclass
            plugin_class = find_plugin_class(module)
            if plugin_class is None:
                raise PluginLoadError(f"No BasePlugin subclass found in {entry_point}")

            logger.info(f"Successfully loaded plugin class: {plugin_class.__name__}")
            return plugin_class

        finally:
            # Remove the plugin directory from sys.path
            if plugin_dir_str in sys.path:
                sys.path.remove(plugin_dir_str)

    except PluginLoadError:
        raise
    except Exception as e:
        raise PluginLoadError(f"Failed to load plugin module: {e}") from e


def find_plugin_class(module) -> Optional[type[BasePlugin]]:
    """
    Find the BasePlugin subclass in a module.

    Args:
        module: The Python module to search

    Returns:
        The plugin class, or None if not found
    """
    for name, obj in inspect.getmembers(module, inspect.isclass):
        # Skip the base class itself
        if obj is BasePlugin:
            continue

        # Check if it's a subclass of BasePlugin
        if issubclass(obj, BasePlugin) and obj.__module__ == module.__name__:
            return obj

    return None


def validate_plugin_class(plugin_class: type) -> list[str]:
    """
    Validate that a class properly implements the BasePlugin interface.

    Args:
        plugin_class: The class to validate

    Returns:
        List of validation error messages (empty if valid)
    """
    errors = []

    # Check it's a subclass of BasePlugin
    if not issubclass(plugin_class, BasePlugin):
        errors.append(f"{plugin_class.__name__} is not a subclass of BasePlugin")
        return errors

    # Check get_meta is implemented
    try:
        meta = plugin_class.get_meta()
        if not meta.slug:
            errors.append("Plugin meta.slug is required")
        if not meta.name:
            errors.append("Plugin meta.name is required")
        if not meta.version:
            errors.append("Plugin meta.version is required")
    except NotImplementedError:
        errors.append("get_meta() is not implemented")
    except Exception as e:
        errors.append(f"get_meta() raised an exception: {e}")

    # Check component methods return valid types
    try:
        importers = plugin_class.get_importers()
        if not isinstance(importers, list):
            errors.append("get_importers() must return a list")
    except Exception as e:
        errors.append(f"get_importers() raised an exception: {e}")

    try:
        preprocessors = plugin_class.get_preprocessors()
        if not isinstance(preprocessors, list):
            errors.append("get_preprocessors() must return a list")
    except Exception as e:
        errors.append(f"get_preprocessors() raised an exception: {e}")

    try:
        postprocessors = plugin_class.get_postprocessors()
        if not isinstance(postprocessors, list):
            errors.append("get_postprocessors() must return a list")
    except Exception as e:
        errors.append(f"get_postprocessors() raised an exception: {e}")

    try:
        datasources = plugin_class.get_datasources()
        if not isinstance(datasources, list):
            errors.append("get_datasources() must return a list")
    except Exception as e:
        errors.append(f"get_datasources() raised an exception: {e}")

    return errors


def unload_plugin_module(plugin_path: Path, entry_point: str) -> bool:
    """
    Unload a dynamically loaded plugin module from sys.modules.

    Args:
        plugin_path: Path to the plugin directory
        entry_point: Filename of the main plugin module

    Returns:
        True if module was unloaded, False if not found
    """
    module_name = f"_dynamic_plugin_{plugin_path.name}_{entry_point.rstrip('.py')}"

    if module_name in sys.modules:
        del sys.modules[module_name]
        logger.debug(f"Unloaded plugin module: {module_name}")
        return True

    return False
