"""
URL handlers for fetching plugin files from various sources.
Supports GitHub repositories and direct download URLs.
"""

import io
import json
import logging
import re
import tarfile
import zipfile
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

# Manifest filenames to look for
MULTI_PLUGIN_MANIFEST = 'datanexus-plugins.json'
SINGLE_PLUGIN_MANIFEST = 'datanexus-plugin.json'
DEFAULT_ENTRY_POINT = 'plugin.py'


class URLHandlerError(Exception):
    """Base exception for URL handler errors."""
    pass


class GitHubHandler:
    """
    Handle GitHub repository URLs.
    Converts github.com URLs to raw.githubusercontent.com for file access.
    """

    # Regex to parse GitHub URLs
    GITHUB_URL_PATTERN = re.compile(
        r'^https?://github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+)/?(?P<rest>.*)?$'
    )

    def __init__(self, timeout: float = 30.0):
        self.timeout = timeout

    def is_github_url(self, url: str) -> bool:
        """Check if a URL is a GitHub repository URL."""
        return bool(self.GITHUB_URL_PATTERN.match(url))

    def parse_url(self, url: str) -> dict[str, str]:
        """
        Parse a GitHub URL into its components.

        Returns:
            dict with 'owner', 'repo', and optionally 'branch', 'path'
        """
        match = self.GITHUB_URL_PATTERN.match(url)
        if not match:
            raise URLHandlerError(f"Not a valid GitHub URL: {url}")

        result = {
            'owner': match.group('owner'),
            'repo': match.group('repo').rstrip('.git'),
        }

        rest = match.group('rest') or ''
        # Parse /tree/branch/path or /blob/branch/path
        if rest.startswith('tree/') or rest.startswith('blob/'):
            parts = rest.split('/', 2)
            if len(parts) >= 2:
                result['branch'] = parts[1]
            if len(parts) >= 3:
                result['path'] = parts[2]

        return result

    def get_raw_file_url(
        self,
        repo_url: str,
        path: str,
        ref: str = 'main'
    ) -> str:
        """
        Get the raw file URL for downloading a file from GitHub.

        Args:
            repo_url: The GitHub repository URL
            path: Path to the file within the repo
            ref: Branch, tag, or commit hash (default: 'main')

        Returns:
            URL to the raw file content
        """
        parsed = self.parse_url(repo_url)
        owner = parsed['owner']
        repo = parsed['repo']
        return f"https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}"

    def fetch_file(
        self,
        repo_url: str,
        path: str,
        ref: str = 'main'
    ) -> Optional[str]:
        """
        Fetch a file's content from a GitHub repository.

        Args:
            repo_url: The GitHub repository URL
            path: Path to the file within the repo
            ref: Branch, tag, or commit hash

        Returns:
            File content as string, or None if not found
        """
        raw_url = self.get_raw_file_url(repo_url, path, ref)
        logger.debug(f"Fetching file from: {raw_url}")

        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get(raw_url)
                if response.status_code == 200:
                    return response.text
                elif response.status_code == 404:
                    logger.debug(f"File not found: {path}")
                    return None
                else:
                    logger.warning(f"Failed to fetch {path}: HTTP {response.status_code}")
                    return None
        except httpx.HTTPError as e:
            logger.error(f"HTTP error fetching {path}: {e}")
            return None

    def fetch_manifest(self, repo_url: str, ref: str = 'main') -> dict[str, Any]:
        """
        Fetch the plugin manifest from a GitHub repository.
        First tries multi-plugin manifest, then single-plugin manifest.

        Args:
            repo_url: The GitHub repository URL
            ref: Branch, tag, or commit hash

        Returns:
            Parsed manifest data, or empty dict if no manifest found
        """
        # Try multi-plugin manifest first
        content = self.fetch_file(repo_url, MULTI_PLUGIN_MANIFEST, ref)
        if content:
            try:
                manifest = json.loads(content)
                manifest['_manifest_type'] = 'multi'
                return manifest
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse {MULTI_PLUGIN_MANIFEST}: {e}")

        # Try single-plugin manifest
        content = self.fetch_file(repo_url, SINGLE_PLUGIN_MANIFEST, ref)
        if content:
            try:
                manifest = json.loads(content)
                manifest['_manifest_type'] = 'single'
                return manifest
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse {SINGLE_PLUGIN_MANIFEST}: {e}")

        # No manifest found - check if there's a plugin.py at root
        plugin_content = self.fetch_file(repo_url, DEFAULT_ENTRY_POINT, ref)
        if plugin_content:
            # Extract basic info from the URL
            parsed = self.parse_url(repo_url)
            return {
                '_manifest_type': 'inferred',
                'slug': parsed['repo'],
                'name': parsed['repo'].replace('-', ' ').replace('_', ' ').title(),
                'entry_point': DEFAULT_ENTRY_POINT,
            }

        return {}

    def get_default_branch(self, repo_url: str) -> str:
        """
        Try to determine the default branch of a repository.
        Tries 'main' first, then 'master'.
        """
        # Check if main branch exists
        content = self.fetch_file(repo_url, 'README.md', 'main')
        if content is not None:
            return 'main'

        # Try master
        content = self.fetch_file(repo_url, 'README.md', 'master')
        if content is not None:
            return 'master'

        # Default to main
        return 'main'

    def download_directory(
        self,
        repo_url: str,
        dir_path: str,
        target_dir: Path,
        ref: str = 'main'
    ) -> bool:
        """
        Download a directory from a GitHub repository as a zip archive.

        Args:
            repo_url: The GitHub repository URL
            dir_path: Path to the directory within the repo (empty string for root)
            target_dir: Local directory to extract files to
            ref: Branch, tag, or commit hash

        Returns:
            True if successful, False otherwise
        """
        parsed = self.parse_url(repo_url)
        owner = parsed['owner']
        repo = parsed['repo']

        # GitHub provides zip archives at a special URL
        archive_url = f"https://github.com/{owner}/{repo}/archive/refs/heads/{ref}.zip"

        try:
            with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
                response = client.get(archive_url)
                if response.status_code != 200:
                    logger.error(f"Failed to download archive: HTTP {response.status_code}")
                    return False

                # Extract the archive
                target_dir.mkdir(parents=True, exist_ok=True)

                with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
                    # The archive contains a root folder named {repo}-{ref}
                    root_prefix = f"{repo}-{ref}/"
                    if dir_path:
                        extract_prefix = f"{root_prefix}{dir_path}/"
                    else:
                        extract_prefix = root_prefix

                    for member in zf.namelist():
                        if member.startswith(extract_prefix) and not member.endswith('/'):
                            # Calculate the relative path
                            rel_path = member[len(extract_prefix):]
                            if rel_path:
                                target_path = target_dir / rel_path
                                target_path.parent.mkdir(parents=True, exist_ok=True)

                                with zf.open(member) as src, open(target_path, 'wb') as dst:
                                    dst.write(src.read())

                return True

        except httpx.HTTPError as e:
            logger.error(f"HTTP error downloading archive: {e}")
            return False
        except zipfile.BadZipFile as e:
            logger.error(f"Invalid zip archive: {e}")
            return False


class DirectURLHandler:
    """
    Handle direct download URLs (zip, tar.gz files).
    """

    def __init__(self, timeout: float = 60.0):
        self.timeout = timeout

    def is_archive_url(self, url: str) -> bool:
        """Check if a URL points to a downloadable archive."""
        parsed = urlparse(url)
        path = parsed.path.lower()
        return path.endswith('.zip') or path.endswith('.tar.gz') or path.endswith('.tgz')

    def download_and_extract(self, url: str, target_dir: Path) -> bool:
        """
        Download an archive from a URL and extract it to target directory.

        Args:
            url: URL to the archive file
            target_dir: Local directory to extract files to

        Returns:
            True if successful, False otherwise
        """
        try:
            with httpx.Client(timeout=self.timeout, follow_redirects=True) as client:
                response = client.get(url)
                if response.status_code != 200:
                    logger.error(f"Failed to download {url}: HTTP {response.status_code}")
                    return False

                content = response.content
                target_dir.mkdir(parents=True, exist_ok=True)

                parsed = urlparse(url)
                path = parsed.path.lower()

                if path.endswith('.zip'):
                    return self._extract_zip(content, target_dir)
                elif path.endswith('.tar.gz') or path.endswith('.tgz'):
                    return self._extract_tarball(content, target_dir)
                else:
                    logger.error(f"Unsupported archive format: {url}")
                    return False

        except httpx.HTTPError as e:
            logger.error(f"HTTP error downloading {url}: {e}")
            return False

    def _extract_zip(self, content: bytes, target_dir: Path) -> bool:
        """Extract a zip archive."""
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as zf:
                # Check for a single root directory
                names = zf.namelist()
                if names and all(n.startswith(names[0].split('/')[0] + '/') for n in names if n):
                    # Has a root directory, strip it
                    root = names[0].split('/')[0] + '/'
                    for member in names:
                        if member.endswith('/'):
                            continue
                        rel_path = member[len(root):] if member.startswith(root) else member
                        if rel_path:
                            target_path = target_dir / rel_path
                            target_path.parent.mkdir(parents=True, exist_ok=True)
                            with zf.open(member) as src, open(target_path, 'wb') as dst:
                                dst.write(src.read())
                else:
                    zf.extractall(target_dir)
            return True
        except zipfile.BadZipFile as e:
            logger.error(f"Invalid zip file: {e}")
            return False

    def _extract_tarball(self, content: bytes, target_dir: Path) -> bool:
        """Extract a tar.gz archive."""
        try:
            with tarfile.open(fileobj=io.BytesIO(content), mode='r:gz') as tf:
                # Check for a single root directory
                names = tf.getnames()
                if names and all(n.startswith(names[0].split('/')[0] + '/') for n in names if n):
                    # Has a root directory, strip it
                    root = names[0].split('/')[0] + '/'
                    for member in tf.getmembers():
                        if member.isdir():
                            continue
                        rel_path = member.name[len(root):] if member.name.startswith(root) else member.name
                        if rel_path:
                            target_path = target_dir / rel_path
                            target_path.parent.mkdir(parents=True, exist_ok=True)
                            with tf.extractfile(member) as src, open(target_path, 'wb') as dst:
                                dst.write(src.read())
                else:
                    tf.extractall(target_dir)
            return True
        except tarfile.TarError as e:
            logger.error(f"Invalid tar file: {e}")
            return False


def get_handler_for_url(url: str) -> tuple[Optional[GitHubHandler | DirectURLHandler], str]:
    """
    Get the appropriate handler for a URL.

    Returns:
        Tuple of (handler instance, handler type string)
        handler type is one of: 'github', 'direct', 'unknown'
    """
    github_handler = GitHubHandler()
    if github_handler.is_github_url(url):
        return github_handler, 'github'

    direct_handler = DirectURLHandler()
    if direct_handler.is_archive_url(url):
        return direct_handler, 'direct'

    # For unknown URLs, try GitHub handler first (might be a GitHub URL without https)
    if 'github.com' in url:
        return github_handler, 'github'

    return None, 'unknown'
