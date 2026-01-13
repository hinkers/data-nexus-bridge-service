"""
Serializers for plugin models.
"""
from rest_framework import serializers

from plugins.models import Plugin, PluginComponent, PluginExecutionLog, PluginInstance


class PluginSerializer(serializers.ModelSerializer):
    """Serializer for Plugin model."""

    components_count = serializers.SerializerMethodField()

    class Meta:
        model = Plugin
        fields = [
            'id',
            'slug',
            'name',
            'author',
            'version',
            'description',
            'python_path',
            'enabled',
            'installed_at',
            'config_schema',
            'config',
            'components_count',
        ]
        read_only_fields = ['id', 'slug', 'name', 'author', 'version', 'description', 'python_path', 'installed_at', 'config_schema', 'components_count']

    def get_components_count(self, obj: Plugin) -> dict:
        """Get count of each component type."""
        components = obj.components.all()
        return {
            'importers': components.filter(component_type=PluginComponent.COMPONENT_TYPE_IMPORTER).count(),
            'preprocessors': components.filter(component_type=PluginComponent.COMPONENT_TYPE_PREPROCESSOR).count(),
            'postprocessors': components.filter(component_type=PluginComponent.COMPONENT_TYPE_POSTPROCESSOR).count(),
        }


class PluginComponentSerializer(serializers.ModelSerializer):
    """Serializer for PluginComponent model."""

    plugin_name = serializers.CharField(source='plugin.name', read_only=True)
    plugin_slug = serializers.CharField(source='plugin.slug', read_only=True)
    full_slug = serializers.SerializerMethodField()
    instances_count = serializers.SerializerMethodField()

    class Meta:
        model = PluginComponent
        fields = [
            'id',
            'plugin',
            'plugin_name',
            'plugin_slug',
            'component_type',
            'slug',
            'full_slug',
            'name',
            'description',
            'python_path',
            'config_schema',
            'instances_count',
        ]
        read_only_fields = fields

    def get_full_slug(self, obj: PluginComponent) -> str:
        """Get the full slug (plugin.component)."""
        return f"{obj.plugin.slug}.{obj.slug}"

    def get_instances_count(self, obj: PluginComponent) -> int:
        """Get count of instances."""
        return obj.instances.count()


class PluginInstanceSerializer(serializers.ModelSerializer):
    """Serializer for PluginInstance model."""

    component_name = serializers.CharField(source='component.name', read_only=True)
    component_type = serializers.CharField(source='component.component_type', read_only=True)
    plugin_name = serializers.CharField(source='component.plugin.name', read_only=True)
    config_schema = serializers.JSONField(source='component.config_schema', read_only=True)

    class Meta:
        model = PluginInstance
        fields = [
            'id',
            'component',
            'component_name',
            'component_type',
            'plugin_name',
            'name',
            'enabled',
            'priority',
            'config',
            'config_schema',
            'event_triggers',
            'collections',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'component_name', 'component_type', 'plugin_name', 'config_schema', 'created_at', 'updated_at']


class PluginInstanceCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating PluginInstance."""

    class Meta:
        model = PluginInstance
        fields = [
            'component',
            'name',
            'enabled',
            'priority',
            'config',
            'event_triggers',
            'collections',
        ]


class PluginExecutionLogSerializer(serializers.ModelSerializer):
    """Serializer for PluginExecutionLog model."""

    instance_name = serializers.CharField(source='instance.name', read_only=True)
    document_identifier = serializers.CharField(source='document.identifier', read_only=True, allow_null=True)

    class Meta:
        model = PluginExecutionLog
        fields = [
            'id',
            'instance',
            'instance_name',
            'document',
            'document_identifier',
            'status',
            'event_type',
            'started_at',
            'completed_at',
            'input_data',
            'output_data',
            'error_message',
        ]
        read_only_fields = fields


class DependencyStatusSerializer(serializers.Serializer):
    """Serializer for dependency status."""

    package = serializers.CharField()
    name = serializers.CharField()
    required_version = serializers.CharField(allow_null=True)
    installed = serializers.BooleanField()
    installed_version = serializers.CharField(allow_null=True)
    satisfied = serializers.BooleanField()


class AvailablePluginSerializer(serializers.Serializer):
    """Serializer for available plugins from the registry."""

    slug = serializers.CharField()
    name = serializers.CharField()
    version = serializers.CharField()
    author = serializers.CharField()
    description = serializers.CharField()
    config_schema = serializers.JSONField()
    dependencies = serializers.ListField(child=serializers.CharField(), default=list)
    dependencies_status = DependencyStatusSerializer(many=True, default=list)
    missing_dependencies = serializers.ListField(child=serializers.CharField(), default=list)
    dependencies_satisfied = serializers.BooleanField(default=True)
    importers = serializers.ListField()
    preprocessors = serializers.ListField()
    postprocessors = serializers.ListField()


class ImporterRunSerializer(serializers.Serializer):
    """Serializer for running an importer."""

    instance_id = serializers.IntegerField()


class ImportResultSerializer(serializers.Serializer):
    """Serializer for import results."""

    success = serializers.BooleanField()
    document_identifier = serializers.CharField(allow_null=True)
    file_name = serializers.CharField(allow_null=True)
    custom_identifier = serializers.CharField(allow_null=True)
    message = serializers.CharField()
