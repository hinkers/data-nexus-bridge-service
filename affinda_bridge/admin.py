from django.contrib import admin

from affinda_bridge.models import (
    Collection,
    DataPoint,
    Document,
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
