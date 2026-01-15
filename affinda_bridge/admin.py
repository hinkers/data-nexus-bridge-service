from django.contrib import admin

from affinda_bridge.models import (
    Collection,
    CollectionView,
    DataPoint,
    Document,
    DocumentFieldValue,
    ExternalTable,
    ExternalTableColumn,
    FieldDefinition,
    SyncHistory,
    Workspace,
)


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'identifier', 'organization_identifier']
    search_fields = ['name', 'identifier', 'organization_identifier']
    list_filter = ['organization_identifier']
    ordering = ['name']


@admin.register(Collection)
class CollectionAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'identifier', 'workspace']
    search_fields = ['name', 'identifier']
    list_filter = ['workspace']
    ordering = ['name']
    raw_id_fields = ['workspace']


@admin.register(DataPoint)
class DataPointAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'identifier', 'slug', 'annotation_content_type', 'organization_identifier', 'is_public']
    search_fields = ['name', 'identifier', 'slug', 'description']
    list_filter = ['annotation_content_type', 'is_public', 'extractor']
    ordering = ['name']


@admin.register(FieldDefinition)
class FieldDefinitionAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'slug', 'collection', 'datapoint_identifier', 'data_type']
    search_fields = ['name', 'slug', 'datapoint_identifier']
    list_filter = ['collection', 'data_type']
    ordering = ['collection', 'name']
    raw_id_fields = ['collection']


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ['id', 'custom_identifier', 'file_name', 'workspace', 'collection', 'state', 'created_dt', 'last_updated_dt']
    search_fields = ['identifier', 'custom_identifier', 'file_name']
    list_filter = ['state', 'in_review', 'failed', 'ready', 'workspace', 'collection', 'created_dt']
    ordering = ['-created_dt']
    raw_id_fields = ['workspace', 'collection']
    readonly_fields = ['created_dt']
    date_hierarchy = 'created_dt'

    fieldsets = (
        ('Basic Information', {
            'fields': ('identifier', 'custom_identifier', 'file_name', 'file_url', 'workspace', 'collection')
        }),
        ('Status', {
            'fields': ('state', 'is_confirmed', 'in_review', 'failed', 'ready', 'validatable', 'has_challenges')
        }),
        ('Timestamps', {
            'fields': ('created_dt', 'uploaded_dt', 'last_updated_dt')
        }),
        ('Data', {
            'fields': ('data', 'meta', 'tags', 'raw'),
            'classes': ('collapse',)
        }),
    )


@admin.register(SyncHistory)
class SyncHistoryAdmin(admin.ModelAdmin):
    list_display = ['id', 'sync_type', 'started_at', 'completed_at', 'success', 'records_synced']
    list_filter = ['sync_type', 'success', 'started_at']
    search_fields = ['error_message']
    ordering = ['-started_at']
    readonly_fields = ['started_at']
    date_hierarchy = 'started_at'


@admin.register(DocumentFieldValue)
class DocumentFieldValueAdmin(admin.ModelAdmin):
    list_display = ['id', 'document', 'field_definition', 'value_preview']
    search_fields = ['document__identifier', 'document__custom_identifier', 'value']
    list_filter = ['field_definition__collection', 'field_definition']
    raw_id_fields = ['document', 'field_definition']

    def value_preview(self, obj):
        if obj.value:
            return obj.value[:50] + '...' if len(obj.value) > 50 else obj.value
        return '-'
    value_preview.short_description = 'Value'


@admin.register(CollectionView)
class CollectionViewAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'collection', 'sql_view_name', 'is_active', 'last_refreshed_at']
    search_fields = ['name', 'sql_view_name', 'description']
    list_filter = ['is_active', 'collection', 'created_at']
    ordering = ['collection', 'name']
    raw_id_fields = ['collection']
    readonly_fields = [
        'sql_view_name', 'is_active', 'last_sql', 'last_refreshed_at',
        'error_message', 'created_at', 'updated_at'
    ]

    fieldsets = (
        ('Basic Information', {
            'fields': ('collection', 'name', 'description', 'include_fields', 'include_document_columns', 'include_external_tables')
        }),
        ('View Status', {
            'fields': ('sql_view_name', 'is_active', 'last_refreshed_at', 'error_message')
        }),
        ('SQL', {
            'fields': ('last_sql',),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


class ExternalTableColumnInline(admin.TabularInline):
    model = ExternalTableColumn
    extra = 0
    readonly_fields = ['sql_column_name']
    ordering = ['display_order', 'name']


@admin.register(ExternalTable)
class ExternalTableAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'collection', 'sql_table_name', 'is_active', 'column_count', 'created_at']
    search_fields = ['name', 'sql_table_name', 'description']
    list_filter = ['is_active', 'collection', 'created_at']
    ordering = ['collection', 'name']
    raw_id_fields = ['collection']
    readonly_fields = [
        'sql_table_name', 'is_active', 'last_sql',
        'error_message', 'created_at', 'updated_at'
    ]
    inlines = [ExternalTableColumnInline]

    fieldsets = (
        ('Basic Information', {
            'fields': ('collection', 'name', 'description')
        }),
        ('Table Status', {
            'fields': ('sql_table_name', 'is_active', 'error_message')
        }),
        ('SQL', {
            'fields': ('last_sql',),
            'classes': ('collapse',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def column_count(self, obj):
        return obj.columns.count()
    column_count.short_description = 'Columns'


@admin.register(ExternalTableColumn)
class ExternalTableColumnAdmin(admin.ModelAdmin):
    list_display = ['id', 'name', 'external_table', 'sql_column_name', 'data_type', 'is_nullable', 'display_order']
    search_fields = ['name', 'sql_column_name', 'external_table__name']
    list_filter = ['data_type', 'is_nullable', 'external_table__collection']
    ordering = ['external_table', 'display_order', 'name']
    raw_id_fields = ['external_table']
    readonly_fields = ['sql_column_name']
