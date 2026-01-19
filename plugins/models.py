from django.db import models
from django.utils import timezone


class PluginSource(models.Model):
    """
    A URL source for discovering and installing plugins.
    Can point to either a single-plugin repo or a multi-plugin repo with a manifest.
    """
    SOURCE_TYPE_BUILTIN = 'builtin'
    SOURCE_TYPE_USER = 'user'
    SOURCE_TYPE_CHOICES = [
        (SOURCE_TYPE_BUILTIN, 'Built-in'),
        (SOURCE_TYPE_USER, 'User-added'),
    ]

    slug = models.SlugField(
        max_length=100,
        unique=True,
        help_text="Unique identifier for this source"
    )
    name = models.CharField(max_length=200, help_text="Display name for this source")
    url = models.URLField(
        max_length=500,
        help_text="Git repository URL or direct download URL"
    )
    source_type = models.CharField(
        max_length=20,
        choices=SOURCE_TYPE_CHOICES,
        default=SOURCE_TYPE_USER
    )
    enabled = models.BooleanField(default=True)

    # Manifest info (populated after fetching)
    is_multi_plugin = models.BooleanField(
        default=False,
        help_text="Whether this source contains multiple plugins"
    )
    manifest_data = models.JSONField(
        default=dict,
        blank=True,
        help_text="Cached manifest data from the source"
    )

    # Tracking
    last_checked_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time we checked for updates"
    )
    last_fetched_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Last time we successfully fetched manifest"
    )
    latest_version = models.CharField(
        max_length=50,
        blank=True,
        help_text="Latest version from manifest or git tag"
    )
    error_message = models.TextField(
        blank=True,
        help_text="Last error message if fetch failed"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['source_type', 'name']

    def __str__(self) -> str:
        return f"{self.name} ({self.get_source_type_display()})"

    @property
    def is_builtin(self) -> bool:
        return self.source_type == self.SOURCE_TYPE_BUILTIN


class Plugin(models.Model):
    """
    Represents an installed plugin package.
    Plugins are Python packages that register importers, pre-processors, and post-processors.
    """
    # Plugin identity
    slug = models.CharField(max_length=128, unique=True, help_text="Unique identifier for the plugin (e.g., 'my-company.email-importer')")
    name = models.CharField(max_length=255, help_text="Display name of the plugin")
    author = models.CharField(max_length=255, blank=True)
    version = models.CharField(max_length=32, help_text="Semantic version (e.g., '1.0.0')")
    description = models.TextField(blank=True)

    # Plugin module path
    python_path = models.CharField(
        max_length=512,
        help_text="Python module path to the plugin class (e.g., 'my_plugin.MyPlugin')"
    )

    # Status
    enabled = models.BooleanField(default=True)
    installed_at = models.DateTimeField(default=timezone.now)

    # Plugin-level configuration schema and values
    config_schema = models.JSONField(
        default=dict,
        blank=True,
        help_text="JSON Schema defining the plugin's global configuration options"
    )
    config = models.JSONField(
        default=dict,
        blank=True,
        help_text="Plugin-level configuration values"
    )

    # Source tracking (for URL-based plugins)
    source = models.ForeignKey(
        'PluginSource',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='plugins',
        help_text="The source this plugin was installed from"
    )
    source_path = models.CharField(
        max_length=200,
        blank=True,
        help_text="Path within the source repo (for multi-plugin repos)"
    )
    installed_version = models.CharField(
        max_length=50,
        blank=True,
        help_text="Version of the plugin when installed"
    )
    available_version = models.CharField(
        max_length=50,
        blank=True,
        help_text="Latest available version from source"
    )
    update_available = models.BooleanField(
        default=False,
        help_text="Whether a newer version is available"
    )
    installed_from_url = models.URLField(
        max_length=500,
        blank=True,
        help_text="Original URL the plugin was installed from"
    )

    class Meta:
        ordering = ['name']

    def __str__(self) -> str:
        return f"{self.name} v{self.version}"


class PluginComponent(models.Model):
    """
    Represents a component (Importer, PreProcessor, PostProcessor, or DataSource) provided by a plugin.
    Each plugin can register multiple components.
    """
    COMPONENT_TYPE_IMPORTER = 'importer'
    COMPONENT_TYPE_PREPROCESSOR = 'preprocessor'
    COMPONENT_TYPE_POSTPROCESSOR = 'postprocessor'
    COMPONENT_TYPE_DATASOURCE = 'datasource'
    COMPONENT_TYPE_CHOICES = [
        (COMPONENT_TYPE_IMPORTER, 'Importer'),
        (COMPONENT_TYPE_PREPROCESSOR, 'Pre-Processor'),
        (COMPONENT_TYPE_POSTPROCESSOR, 'Post-Processor'),
        (COMPONENT_TYPE_DATASOURCE, 'Data Source'),
    ]

    plugin = models.ForeignKey(
        Plugin,
        on_delete=models.CASCADE,
        related_name='components'
    )
    component_type = models.CharField(max_length=32, choices=COMPONENT_TYPE_CHOICES)
    slug = models.CharField(max_length=128, help_text="Component identifier within the plugin")
    name = models.CharField(max_length=255, help_text="Display name")
    description = models.TextField(blank=True)

    # Python class path for this component
    python_path = models.CharField(
        max_length=512,
        help_text="Python class path (e.g., 'my_plugin.importers.EmailImporter')"
    )

    # Configuration schema for instances of this component
    config_schema = models.JSONField(
        default=dict,
        blank=True,
        help_text="JSON Schema defining configuration options for instances"
    )

    class Meta:
        ordering = ['plugin', 'component_type', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['plugin', 'slug'],
                name='unique_plugin_component_slug'
            )
        ]

    def __str__(self) -> str:
        return f"{self.plugin.name} - {self.name} ({self.get_component_type_display()})"


class PluginInstance(models.Model):
    """
    A configured instance of a plugin component.
    Users can create multiple instances of the same component with different configurations.
    """
    # Post-processor event triggers
    EVENT_DOCUMENT_UPLOADED = 'document_uploaded'
    EVENT_DOCUMENT_APPROVED = 'document_approved'
    EVENT_DOCUMENT_REJECTED = 'document_rejected'
    EVENT_DOCUMENT_ARCHIVED = 'document_archived'
    EVENT_DOCUMENT_UPDATED = 'document_updated'
    EVENT_CHOICES = [
        (EVENT_DOCUMENT_UPLOADED, 'Document Uploaded'),
        (EVENT_DOCUMENT_APPROVED, 'Document Approved'),
        (EVENT_DOCUMENT_REJECTED, 'Document Rejected'),
        (EVENT_DOCUMENT_ARCHIVED, 'Document Archived'),
        (EVENT_DOCUMENT_UPDATED, 'Document Updated'),
    ]

    component = models.ForeignKey(
        PluginComponent,
        on_delete=models.CASCADE,
        related_name='instances'
    )
    name = models.CharField(max_length=255, help_text="User-defined name for this instance")

    # Status and ordering
    enabled = models.BooleanField(default=True)
    priority = models.IntegerField(
        default=100,
        help_text="Execution order (lower = earlier). Used for pre/post-processors."
    )

    # Instance-specific configuration
    config = models.JSONField(
        default=dict,
        blank=True,
        help_text="Instance-specific configuration values"
    )

    # For post-processors: which events trigger this instance
    event_triggers = models.JSONField(
        default=list,
        blank=True,
        help_text="List of event types that trigger this post-processor"
    )

    # Optional: limit to specific collections
    collections = models.ManyToManyField(
        'affinda_bridge.Collection',
        blank=True,
        related_name='plugin_instances',
        help_text="Limit this instance to specific collections (empty = all collections)"
    )

    # For data source components: the Affinda data source to sync to
    affinda_data_source = models.CharField(
        max_length=255,
        blank=True,
        help_text="Affinda data source identifier (for data source components)"
    )

    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['priority', 'name']

    def __str__(self) -> str:
        return f"{self.name} ({self.component.name})"

    @property
    def component_type(self) -> str:
        return self.component.component_type


class PluginExecutionLog(models.Model):
    """
    Log of plugin executions for debugging and auditing.
    """
    STATUS_STARTED = 'started'
    STATUS_SUCCESS = 'success'
    STATUS_FAILED = 'failed'
    STATUS_CHOICES = [
        (STATUS_STARTED, 'Started'),
        (STATUS_SUCCESS, 'Success'),
        (STATUS_FAILED, 'Failed'),
    ]

    instance = models.ForeignKey(
        PluginInstance,
        on_delete=models.CASCADE,
        related_name='execution_logs'
    )
    document = models.ForeignKey(
        'affinda_bridge.Document',
        on_delete=models.CASCADE,
        related_name='plugin_execution_logs',
        null=True,
        blank=True
    )

    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_STARTED)
    event_type = models.CharField(max_length=64, blank=True, help_text="Event that triggered this execution")

    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Execution details
    input_data = models.JSONField(default=dict, blank=True)
    output_data = models.JSONField(default=dict, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ['-started_at']
        indexes = [
            models.Index(fields=['instance', '-started_at']),
            models.Index(fields=['document', '-started_at']),
            models.Index(fields=['status']),
        ]

    def __str__(self) -> str:
        return f"{self.instance.name} - {self.status} at {self.started_at}"
