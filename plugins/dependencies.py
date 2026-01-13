"""
Dependency management for plugins.

Provides utilities for checking and installing plugin dependencies.
"""
import logging
import subprocess
import sys
from dataclasses import dataclass

from packaging import version
from packaging.requirements import Requirement

logger = logging.getLogger(__name__)


@dataclass
class DependencyStatus:
    """Status of a single dependency."""
    package: str  # Original requirement string (e.g., "httpx>=0.24")
    name: str  # Package name only (e.g., "httpx")
    required_version: str | None  # Version specifier if any
    installed: bool
    installed_version: str | None = None
    satisfied: bool = False  # True if installed AND meets version requirements


def check_dependency(requirement_str: str) -> DependencyStatus:
    """
    Check if a single dependency is installed and satisfies version requirements.

    Args:
        requirement_str: A pip-style requirement string (e.g., "httpx>=0.24", "boto3")

    Returns:
        DependencyStatus with installation and version info
    """
    try:
        req = Requirement(requirement_str)
        package_name = req.name

        # Try to import the package and get its version
        try:
            from importlib.metadata import version as get_version
            installed_version = get_version(package_name)
            installed = True

            # Check if version satisfies the requirement
            if req.specifier:
                satisfied = req.specifier.contains(installed_version)
            else:
                satisfied = True  # No version requirement

        except Exception:
            installed = False
            installed_version = None
            satisfied = False

        return DependencyStatus(
            package=requirement_str,
            name=package_name,
            required_version=str(req.specifier) if req.specifier else None,
            installed=installed,
            installed_version=installed_version,
            satisfied=satisfied,
        )

    except Exception as e:
        logger.error(f"Failed to parse requirement '{requirement_str}': {e}")
        return DependencyStatus(
            package=requirement_str,
            name=requirement_str,
            required_version=None,
            installed=False,
            installed_version=None,
            satisfied=False,
        )


def check_dependencies(requirements: list[str]) -> list[DependencyStatus]:
    """
    Check multiple dependencies.

    Args:
        requirements: List of pip-style requirement strings

    Returns:
        List of DependencyStatus objects
    """
    return [check_dependency(req) for req in requirements]


def get_missing_dependencies(requirements: list[str]) -> list[DependencyStatus]:
    """
    Get only the dependencies that are missing or don't meet version requirements.

    Args:
        requirements: List of pip-style requirement strings

    Returns:
        List of DependencyStatus objects for unsatisfied dependencies
    """
    statuses = check_dependencies(requirements)
    return [s for s in statuses if not s.satisfied]


def install_dependencies(requirements: list[str], upgrade: bool = False) -> dict:
    """
    Install dependencies using pip.

    Args:
        requirements: List of pip-style requirement strings to install
        upgrade: Whether to upgrade existing packages

    Returns:
        Dict with 'success', 'installed', 'failed', and 'output' keys
    """
    if not requirements:
        return {
            'success': True,
            'installed': [],
            'failed': [],
            'output': 'No dependencies to install',
        }

    installed = []
    failed = []
    outputs = []

    for req in requirements:
        try:
            cmd = [sys.executable, '-m', 'pip', 'install']
            if upgrade:
                cmd.append('--upgrade')
            cmd.append(req)

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120,  # 2 minute timeout per package
            )

            if result.returncode == 0:
                installed.append(req)
                outputs.append(f"Successfully installed {req}")
                logger.info(f"Successfully installed dependency: {req}")
            else:
                failed.append(req)
                outputs.append(f"Failed to install {req}: {result.stderr}")
                logger.error(f"Failed to install dependency {req}: {result.stderr}")

        except subprocess.TimeoutExpired:
            failed.append(req)
            outputs.append(f"Timeout installing {req}")
            logger.error(f"Timeout installing dependency: {req}")
        except Exception as e:
            failed.append(req)
            outputs.append(f"Error installing {req}: {str(e)}")
            logger.error(f"Error installing dependency {req}: {e}")

    return {
        'success': len(failed) == 0,
        'installed': installed,
        'failed': failed,
        'output': '\n'.join(outputs),
    }
