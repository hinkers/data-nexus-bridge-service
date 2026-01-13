"""
Admin configuration for plugin models.
"""
from django.contrib import admin

from plugins.models import Plugin, PluginComponent, PluginExecutionLog, PluginInstance


class PluginComponentInline(admin.TabularInline):
    """Inline admin for plugin components."""
    model = PluginComponent
    extra = 0
    readonly_fields = ['slug', 'name', 'component_type', 'python_path']
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Plugin)
class PluginAdmin(admin.ModelAdmin):
    """Admin for Plugin model."""
    list_display = ['name', 'slug', 'version', 'author', 'enabled', 'installed_at']
    list_filter = ['enabled', 'installed_at']
    search_fields = ['name', 'slug', 'author', 'description']
    readonly_fields = ['slug', 'name', 'author', 'version', 'description', 'python_path', 'installed_at', 'config_schema']
    ordering = ['name']

    fieldsets = (
        ('Plugin Info', {
            'fields': ('slug', 'name', 'author', 'version', 'description', 'python_path')
        }),
        ('Status', {
            'fields': ('enabled', 'installed_at')
        }),
        ('Configuration', {
            'fields': ('config_schema', 'config'),
            'classes': ('collapse',)
        }),
    )

    inlines = [PluginComponentInline]


@admin.register(PluginComponent)
class PluginComponentAdmin(admin.ModelAdmin):
    """Admin for PluginComponent model."""
    list_display = ['name', 'plugin', 'component_type', 'slug']
    list_filter = ['component_type', 'plugin']
    search_fields = ['name', 'slug', 'description', 'plugin__name']
    readonly_fields = ['plugin', 'slug', 'name', 'description', 'component_type', 'python_path', 'config_schema']
    ordering = ['plugin__name', 'component_type', 'name']


class PluginInstanceCollectionInline(admin.TabularInline):
    """Inline for collection assignments."""
    model = PluginInstance.collections.through
    extra = 0


@admin.register(PluginInstance)
class PluginInstanceAdmin(admin.ModelAdmin):
    """Admin for PluginInstance model."""
    list_display = ['name', 'component', 'get_component_type', 'enabled', 'priority', 'created_at']
    list_filter = ['enabled', 'component__component_type', 'component__plugin', 'created_at']
    search_fields = ['name', 'component__name', 'component__plugin__name']
    ordering = ['priority', 'name']
    filter_horizontal = ['collections']

    fieldsets = (
        ('Instance Info', {
            'fields': ('component', 'name')
        }),
        ('Status', {
            'fields': ('enabled', 'priority')
        }),
        ('Configuration', {
            'fields': ('config',)
        }),
        ('Event Triggers (Post-Processors)', {
            'fields': ('event_triggers',),
            'classes': ('collapse',),
            'description': 'Select which events trigger this post-processor.'
        }),
        ('Collection Filter', {
            'fields': ('collections',),
            'classes': ('collapse',),
            'description': 'Limit this instance to specific collections. Leave empty for all collections.'
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
        }),
    )
    readonly_fields = ['created_at', 'updated_at']

    @admin.display(description='Type')
    def get_component_type(self, obj):
        return obj.component.get_component_type_display()


@admin.register(PluginExecutionLog)
class PluginExecutionLogAdmin(admin.ModelAdmin):
    """Admin for PluginExecutionLog model."""
    list_display = ['id', 'instance', 'document', 'status', 'event_type', 'started_at', 'completed_at']
    list_filter = ['status', 'event_type', 'instance__component__component_type', 'started_at']
    search_fields = ['instance__name', 'document__identifier', 'error_message']
    readonly_fields = ['instance', 'document', 'status', 'event_type', 'started_at', 'completed_at', 'input_data', 'output_data', 'error_message']
    ordering = ['-started_at']
    date_hierarchy = 'started_at'

    fieldsets = (
        ('Execution Info', {
            'fields': ('instance', 'document', 'event_type')
        }),
        ('Status', {
            'fields': ('status', 'started_at', 'completed_at')
        }),
        ('Data', {
            'fields': ('input_data', 'output_data', 'error_message'),
            'classes': ('collapse',)
        }),
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
