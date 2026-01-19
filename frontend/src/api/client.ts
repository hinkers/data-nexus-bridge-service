import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add authentication token to all requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 unauthorized responses (token expired/invalid)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token is invalid or expired, clear auth data and redirect to login
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API response types
export interface Workspace {
  id: number;
  identifier: string;
  name: string;
  organization_identifier: string;
  raw: Record<string, any>;
}

export interface Collection {
  id: number;
  identifier: string;
  name: string;
  workspace: number;
  workspace_name: string;
  raw: Record<string, any>;
}

export interface FieldDefinition {
  id: number;
  collection: number;
  collection_name: string;
  datapoint_identifier: string;
  name: string;
  slug: string;
  data_type: string;
  raw: Record<string, any>;
}

export interface DataPoint {
  id: number;
  identifier: string;
  name: string;
  slug: string;
  description: string;
  annotation_content_type: string;
  organization_identifier: string;
  extractor: string;
  is_public: boolean;
  raw: Record<string, any>;
}

export interface Document {
  id: number;
  identifier: string;
  custom_identifier: string;
  file_name: string;
  file_url: string;
  review_url: string;
  workspace: number;
  workspace_name: string;
  collection: number;
  collection_name: string;
  state: string;
  is_confirmed?: boolean;
  in_review: boolean;
  failed: boolean;
  ready: boolean;
  validatable?: boolean;
  has_challenges?: boolean;
  sync_enabled: boolean;
  created_dt: string;
  uploaded_dt?: string;
  last_updated_dt?: string;
  data?: Record<string, any>;
  meta?: Record<string, any>;
  tags?: string[];
  raw: Record<string, any>;
}

export interface SyncHistory {
  id: number;
  sync_type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  collection: number | null;
  collection_name: string | null;
  started_at: string;
  completed_at: string | null;
  success: boolean;
  records_synced: number;
  error_message: string;
  total_documents: number;
  documents_created: number;
  documents_updated: number;
  documents_failed: number;
  progress_percent: number;
  log_entries_count: number;
  error_count: number;
}

export interface SyncLogEntry {
  id: number;
  sync_history: number;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  document_identifier: string;
  details: Record<string, any>;
  timestamp: string;
}

export interface SyncLogsResponse {
  sync_id: number;
  sync_type: string;
  status: string;
  total_entries: number;
  entries: SyncLogEntry[];
}

export interface LatestSyncs {
  workspaces?: SyncHistory;
  collections?: SyncHistory;
  field_definitions?: SyncHistory;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// API functions
export const workspacesApi = {
  list: () => apiClient.get<PaginatedResponse<Workspace>>('/api/workspaces/'),
  get: (identifier: string) => apiClient.get<Workspace>(`/api/workspaces/${identifier}/`),
  sync: () => apiClient.post('/api/workspaces/sync/'),
};

export interface CollectionSyncResult {
  success: boolean;
  message: string;
  sync_id: number;
  collection_identifier: string;
}

export interface CollectionSyncStatus {
  has_sync: boolean;
  message?: string;
  sync_id?: number;
  sync_type?: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  started_at?: string;
  completed_at?: string | null;
  success?: boolean;
  total_documents?: number;
  documents_created?: number;
  documents_updated?: number;
  documents_failed?: number;
  progress_percent?: number;
  error_message?: string;
}

export const collectionsApi = {
  list: (params?: { workspace?: string }) =>
    apiClient.get<PaginatedResponse<Collection>>('/api/collections/', {
      params,
    }),
  get: (identifier: string) => apiClient.get<Collection>(`/api/collections/${identifier}/`),
  fullSync: (identifier: string) =>
    apiClient.post<CollectionSyncResult>(`/api/collections/${identifier}/full-sync/`),
  getSyncStatus: (identifier: string) =>
    apiClient.get<CollectionSyncStatus>(`/api/collections/${identifier}/sync-status/`),
};

export const fieldDefinitionsApi = {
  list: (collection?: string) =>
    apiClient.get<PaginatedResponse<FieldDefinition>>('/api/field-definitions/', {
      params: collection ? { collection } : undefined,
    }),
};

export const dataPointsApi = {
  list: () => apiClient.get<PaginatedResponse<DataPoint>>('/api/data-points/'),
  get: (identifier: string) => apiClient.get<DataPoint>(`/api/data-points/${identifier}/`),
};

export interface DocumentRefreshResult {
  success: boolean;
  message: string;
  document?: Document;
}

export interface DocumentToggleSyncResult {
  success: boolean;
  document_id: number;
  sync_enabled: boolean;
}

export interface SelectiveSyncResult {
  success: boolean;
  message: string;
  sync_id: number;
  collection_id: number | null;
}

export const documentsApi = {
  list: (params?: { workspace?: string; collection?: string; state?: string; page?: number; search?: string }) =>
    apiClient.get<PaginatedResponse<Document>>('/api/documents/', { params }),
  get: (id: number) => apiClient.get<Document>(`/api/documents/${id}/`),
  refresh: (id: number) => apiClient.post<DocumentRefreshResult>(`/api/documents/${id}/refresh/`),
  toggleSync: (id: number, syncEnabled?: boolean) =>
    apiClient.patch<DocumentToggleSyncResult>(`/api/documents/${id}/toggle-sync/`,
      syncEnabled !== undefined ? { sync_enabled: syncEnabled } : {}),
  selectiveSync: (collectionId?: number) =>
    apiClient.post<SelectiveSyncResult>('/api/documents/selective-sync/',
      collectionId ? { collection_id: collectionId } : {}),
};

export const syncHistoryApi = {
  latest: () => apiClient.get<LatestSyncs>('/api/sync-history/latest/'),
  list: (params?: { sync_type?: string; success?: boolean }) =>
    apiClient.get<PaginatedResponse<SyncHistory>>('/api/sync-history/', { params }),
  get: (id: number) => apiClient.get<SyncHistory>(`/api/sync-history/${id}/`),
  getLogs: (id: number, params?: { level?: string; document?: string }) =>
    apiClient.get<SyncLogsResponse>(`/api/sync-history/${id}/logs/`, { params }),
};

// Plugin types
export interface Plugin {
  id: number;
  slug: string;
  name: string;
  author: string;
  version: string;
  description: string;
  python_path: string;
  enabled: boolean;
  installed_at: string;
  config_schema: Record<string, any>;
  config: Record<string, any>;
  components_count: {
    importers: number;
    preprocessors: number;
    postprocessors: number;
  };
}

export interface PluginComponent {
  id: number;
  plugin: number;
  plugin_name: string;
  plugin_slug: string;
  component_type: 'importer' | 'preprocessor' | 'postprocessor';
  slug: string;
  full_slug: string;
  name: string;
  description: string;
  python_path: string;
  config_schema: Record<string, any>;
  instances_count: number;
}

export interface PluginInstance {
  id: number;
  component: number;
  component_name: string;
  component_type: 'importer' | 'preprocessor' | 'postprocessor';
  plugin_name: string;
  name: string;
  enabled: boolean;
  priority: number;
  config: Record<string, any>;
  config_schema: Record<string, any>;
  event_triggers: string[];
  collections: number[];
  created_at: string;
  updated_at: string;
}

export interface DependencyStatus {
  package: string;
  name: string;
  required_version: string | null;
  installed: boolean;
  installed_version: string | null;
  satisfied: boolean;
}

export interface AvailablePlugin {
  slug: string;
  name: string;
  version: string;
  author: string;
  description: string;
  config_schema: Record<string, any>;
  dependencies: string[];
  dependencies_status: DependencyStatus[];
  missing_dependencies: string[];
  dependencies_satisfied: boolean;
  importers: Array<{
    slug: string;
    name: string;
    description: string;
    config_schema: Record<string, any>;
  }>;
  preprocessors: Array<{
    slug: string;
    name: string;
    description: string;
    config_schema: Record<string, any>;
  }>;
  postprocessors: Array<{
    slug: string;
    name: string;
    description: string;
    config_schema: Record<string, any>;
    supported_events: string[];
  }>;
}

export interface PluginExecutionLog {
  id: number;
  instance: number;
  instance_name: string;
  document: number | null;
  document_identifier: string | null;
  status: 'started' | 'success' | 'failed';
  event_type: string;
  started_at: string;
  completed_at: string | null;
  input_data: Record<string, any>;
  output_data: Record<string, any>;
  error_message: string;
}

// Plugin API functions
export const pluginsApi = {
  list: () => apiClient.get<PaginatedResponse<Plugin>>('/api/plugins/'),
  get: (slug: string) => apiClient.get<Plugin>(`/api/plugins/${slug}/`),
  available: () => apiClient.get<AvailablePlugin[]>('/api/plugins/available/'),
  install: (slug: string, config?: Record<string, any>) =>
    apiClient.post<Plugin>('/api/plugins/install/', { slug, config }),
  uninstall: (slug: string) => apiClient.delete(`/api/plugins/${slug}/uninstall/`),
  toggle: (slug: string) => apiClient.post<{ enabled: boolean }>(`/api/plugins/${slug}/toggle/`),
  updateConfig: (slug: string, config: Record<string, any>) =>
    apiClient.patch<Plugin>(`/api/plugins/${slug}/`, { config }),
  installDependencies: (slug: string, packages?: string[]) =>
    apiClient.post<{ success: boolean; message: string; installed: string[]; failed: string[] }>(
      '/api/plugins/install-dependencies/',
      { slug, packages }
    ),
  checkDependencies: (slug: string) =>
    apiClient.post<{ dependencies: DependencyStatus[]; missing: string[]; satisfied: boolean }>(
      '/api/plugins/check-dependencies/',
      { slug }
    ),
};

export const pluginComponentsApi = {
  list: (params?: { plugin?: string; type?: string }) =>
    apiClient.get<PaginatedResponse<PluginComponent>>('/api/plugin-components/', { params }),
  importers: () => apiClient.get<PluginComponent[]>('/api/plugin-components/importers/'),
  preprocessors: () => apiClient.get<PluginComponent[]>('/api/plugin-components/preprocessors/'),
  postprocessors: () => apiClient.get<PluginComponent[]>('/api/plugin-components/postprocessors/'),
};

export const pluginInstancesApi = {
  list: (params?: { type?: string; plugin?: string; enabled?: boolean }) =>
    apiClient.get<PaginatedResponse<PluginInstance>>('/api/plugin-instances/', { params }),
  get: (id: number) => apiClient.get<PluginInstance>(`/api/plugin-instances/${id}/`),
  create: (data: {
    component: number;
    name: string;
    enabled?: boolean;
    priority?: number;
    config?: Record<string, any>;
    event_triggers?: string[];
    collections?: number[];
  }) => apiClient.post<PluginInstance>('/api/plugin-instances/', data),
  update: (id: number, data: Partial<PluginInstance>) =>
    apiClient.patch<PluginInstance>(`/api/plugin-instances/${id}/`, data),
  delete: (id: number) => apiClient.delete(`/api/plugin-instances/${id}/`),
  toggle: (id: number) => apiClient.post<{ enabled: boolean }>(`/api/plugin-instances/${id}/toggle/`),
  run: (id: number) => apiClient.post<{ success: boolean; results: any[] }>(`/api/plugin-instances/${id}/run/`),
  importers: () => apiClient.get<PluginInstance[]>('/api/plugin-instances/importers/'),
  preprocessors: () => apiClient.get<PluginInstance[]>('/api/plugin-instances/preprocessors/'),
  postprocessors: () => apiClient.get<PluginInstance[]>('/api/plugin-instances/postprocessors/'),
};

export const pluginLogsApi = {
  list: (params?: { instance?: number; document?: number; status?: string; event?: string }) =>
    apiClient.get<PaginatedResponse<PluginExecutionLog>>('/api/plugin-logs/', { params }),
};

// System API types
export interface GitInfo {
  current_commit: string | null;
  current_commit_short: string | null;
  current_branch: string | null;
  last_commit_date: string | null;
  last_commit_message: string | null;
  remote_url: string | null;
  has_uncommitted_changes: boolean | null;
  is_git_repo: boolean;
  error?: string;
}

export interface VersionInfo {
  app_version: string;
  git: GitInfo;
  debug_mode: boolean;
  database_engine: string;
}

export interface UpdateCheckResult {
  update_available: boolean;
  local_commit?: string;
  remote_commit?: string;
  commits_behind?: number;
  commits_ahead?: number;
  new_commits?: Array<{ hash: string; message: string }>;
  current_branch?: string;
  error?: string;
}

export interface UpdateApplyResult {
  success: boolean;
  message?: string;
  output?: string;
  new_commit?: string;
  requires_restart?: boolean;
  error?: string;
  has_uncommitted_changes?: boolean;
}

export interface SystemStatus {
  database: {
    status: string;
    engine: string;
  };
  plugins: {
    available: number;
    installed: number;
    active_instances: number;
  };
  debug_mode: boolean;
}

// Affinda Settings types
export interface AffindaSettings {
  api_key: string;
  base_url: string;
  organization: string;
  is_configured: boolean;
  api_key_source: 'database' | 'environment' | 'not_set';
}

export interface AffindaTestResult {
  success: boolean;
  message: string;
  workspaces_count?: number;
}

export interface AffindaClearResult {
  success: boolean;
  message: string;
}

// System API functions
export const systemApi = {
  getVersion: () => apiClient.get<VersionInfo>('/api/system/version/'),
  getStatus: () => apiClient.get<SystemStatus>('/api/system/status/'),
  checkUpdates: () => apiClient.get<UpdateCheckResult>('/api/system/updates/check/'),
  applyUpdates: () => apiClient.post<UpdateApplyResult>('/api/system/updates/apply/'),
  // Affinda settings
  getAffindaSettings: () => apiClient.get<AffindaSettings>('/api/system/affinda/'),
  updateAffindaSettings: (data: { api_key?: string; base_url?: string; organization?: string }) =>
    apiClient.post<AffindaSettings>('/api/system/affinda/update/', data),
  testAffindaConnection: () => apiClient.post<AffindaTestResult>('/api/system/affinda/test/'),
  clearAffindaApiKey: () => apiClient.post<AffindaClearResult>('/api/system/affinda/clear/'),
};

// Collection View types
export interface DocumentColumnOption {
  name: string;
  label: string;
}

export interface ExternalTableColumnSummary {
  id: number;
  name: string;
  sql_column_name: string;
  data_type: string;
}

export interface ExternalTableSummary {
  id: number;
  name: string;
  sql_table_name: string;
  is_active: boolean;
  column_count: number;
  columns: ExternalTableColumnSummary[];
}

export interface CollectionView {
  id: number;
  collection: number;
  collection_name: string;
  name: string;
  sql_view_name: string;
  description: string;
  is_active: boolean;
  include_fields: number[];
  include_document_columns: string[];
  include_external_tables: number[];
  include_external_table_columns: Record<string, number[]>;
  last_refreshed_at: string | null;
  error_message: string;
  created_at: string;
  updated_at: string;
  fields_count: number;
  available_document_columns: DocumentColumnOption[];
  available_external_tables: ExternalTableSummary[];
}

export interface CollectionViewPreview {
  create_sql: string;
  drop_sql: string;
  document_columns: string[];
  available_document_columns: DocumentColumnOption[];
  fields: Array<{
    id: number;
    name: string;
    slug: string;
    column_name: string;
  }>;
  db_engine: string;
}

export interface CollectionViewActionResult {
  success: boolean;
  message: string;
  is_active: boolean;
  last_refreshed_at?: string;
  synced_count?: number;
}

// Collection View API functions
export const collectionViewsApi = {
  list: (params?: { collection?: number; is_active?: boolean }) =>
    apiClient.get<PaginatedResponse<CollectionView>>('/api/collection-views/', { params }),
  get: (id: number) => apiClient.get<CollectionView>(`/api/collection-views/${id}/`),
  create: (data: {
    collection: number;
    name: string;
    description?: string;
    include_fields?: number[];
    include_document_columns?: string[];
    include_external_tables?: number[];
    include_external_table_columns?: Record<string, number[]>;
  }) => apiClient.post<CollectionView>('/api/collection-views/', data),
  update: (id: number, data: {
    name?: string;
    description?: string;
    include_fields?: number[];
    include_document_columns?: string[];
    include_external_tables?: number[];
    include_external_table_columns?: Record<string, number[]>;
  }) => apiClient.patch<CollectionView>(`/api/collection-views/${id}/`, data),
  delete: (id: number) => apiClient.delete(`/api/collection-views/${id}/`),
  activate: (id: number) =>
    apiClient.post<CollectionViewActionResult>(`/api/collection-views/${id}/activate/`),
  deactivate: (id: number) =>
    apiClient.post<CollectionViewActionResult>(`/api/collection-views/${id}/deactivate/`),
  refresh: (id: number) =>
    apiClient.post<CollectionViewActionResult>(`/api/collection-views/${id}/refresh/`),
  preview: (id: number) =>
    apiClient.get<CollectionViewPreview>(`/api/collection-views/${id}/preview/`),
};

// External Table types
export interface ExternalTableColumn {
  id: number;
  external_table: number;
  name: string;
  sql_column_name: string;
  data_type: 'text' | 'integer' | 'decimal' | 'boolean' | 'date' | 'datetime';
  is_nullable: boolean;
  default_value: string | null;
  display_order: number;
}

export interface ExternalTableTypeOption {
  value: string;
  label: string;
}

export interface ExternalTable {
  id: number;
  collection: number;
  collection_name: string;
  name: string;
  sql_table_name: string;
  description: string;
  is_active: boolean;
  error_message: string;
  created_at: string;
  updated_at: string;
  columns: ExternalTableColumn[];
  column_count: number;
  available_types: ExternalTableTypeOption[];
}

export interface ExternalTableActionResult {
  success: boolean;
  message: string;
  is_active?: boolean;
  sql?: string;
}

export interface ExternalTablePreview {
  create_sql: string;
  drop_sql: string;
  db_engine: string;
}

// External Table API functions
export const externalTablesApi = {
  list: (params?: { collection?: number; is_active?: boolean }) =>
    apiClient.get<PaginatedResponse<ExternalTable>>('/api/external-tables/', { params }),
  get: (id: number) => apiClient.get<ExternalTable>(`/api/external-tables/${id}/`),
  create: (data: {
    collection: number;
    name: string;
    description?: string;
    columns?: Array<{
      name: string;
      data_type: string;
      is_nullable?: boolean;
      display_order?: number;
    }>;
  }) => apiClient.post<ExternalTable>('/api/external-tables/', data),
  update: (id: number, data: {
    name?: string;
    description?: string;
  }) => apiClient.patch<ExternalTable>(`/api/external-tables/${id}/`, data),
  delete: (id: number) => apiClient.delete(`/api/external-tables/${id}/`),
  activate: (id: number) =>
    apiClient.post<ExternalTableActionResult>(`/api/external-tables/${id}/activate/`),
  deactivate: (id: number) =>
    apiClient.post<ExternalTableActionResult>(`/api/external-tables/${id}/deactivate/`),
  rebuild: (id: number) =>
    apiClient.post<ExternalTableActionResult>(`/api/external-tables/${id}/rebuild/`),
  preview: (id: number) =>
    apiClient.get<ExternalTablePreview>(`/api/external-tables/${id}/preview/`),
};

// External Table Column API functions
export const externalTableColumnsApi = {
  list: (params?: { external_table?: number }) =>
    apiClient.get<PaginatedResponse<ExternalTableColumn>>('/api/external-table-columns/', { params }),
  get: (id: number) => apiClient.get<ExternalTableColumn>(`/api/external-table-columns/${id}/`),
  create: (data: {
    external_table: number;
    name: string;
    data_type: string;
    is_nullable?: boolean;
    default_value?: string | null;
    display_order?: number;
  }) => apiClient.post<ExternalTableColumn>('/api/external-table-columns/', data),
  update: (id: number, data: {
    name?: string;
    data_type?: string;
    is_nullable?: boolean;
    default_value?: string | null;
    display_order?: number;
  }) => apiClient.patch<ExternalTableColumn>(`/api/external-table-columns/${id}/`, data),
  delete: (id: number) => apiClient.delete(`/api/external-table-columns/${id}/`),
};

// Webhook Configuration types
export interface WebhookEvent {
  value: string;
  label: string;
}

export interface WebhookConfig {
  enabled: boolean;
  webhook_url: string;
  secret_token: string;
  enabled_events: string[];
  available_events: WebhookEvent[];
}

export interface WebhookRegenerateResult {
  success: boolean;
  message: string;
  webhook_url: string;
  secret_token: string;
}

// Webhook Configuration API functions
export const webhooksApi = {
  getConfig: () => apiClient.get<WebhookConfig>('/api/system/webhooks/'),
  updateConfig: (data: { enabled?: boolean; enabled_events?: string[] }) =>
    apiClient.post<WebhookConfig>('/api/system/webhooks/update/', data),
  regenerateToken: () =>
    apiClient.post<WebhookRegenerateResult>('/api/system/webhooks/regenerate-token/'),
};

// Sync Schedule types
export interface SyncScheduleRun {
  id: number;
  schedule: number;
  schedule_name: string;
  sync_type: string;
  sync_history: number;
  sync_history_status: string;
  sync_history_success: boolean;
  documents_synced: number;
  error_message: string | null;
  triggered_by: 'scheduled' | 'manual';
  started_at: string;
  completed_at: string | null;
}

export interface SyncSchedule {
  id: number;
  name: string;
  sync_type: 'full_collection' | 'selective' | 'data_source';
  collection: number | null;
  collection_name: string | null;
  plugin_instance: number | null;
  plugin_instance_name: string | null;
  enabled: boolean;
  cron_expression: string;
  cron_description: string;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  updated_at: string;
  recent_runs: SyncScheduleRun[];
}

export interface DataSourceInstance {
  id: number;
  name: string;
  component_name: string;
  plugin_name: string;
  affinda_data_source: string;
}

export interface DataSourceInstancesResult {
  instances: DataSourceInstance[];
}

export interface SyncSchedulePresets {
  presets: Array<{ label: string; value: string }>;
  sync_types: Array<{ value: string; label: string }>;
}

export interface SyncScheduleRunNowResult {
  success: boolean;
  message: string;
  sync_id: number | null;
}

export interface SyncScheduleHistoryResult {
  schedule_id: number;
  schedule_name: string;
  runs: SyncScheduleRun[];
}

export interface AllRunsResult {
  runs: SyncScheduleRun[];
  total: number;
}

// System Reports types
export interface SystemReportsAlert {
  level: 'info' | 'warning' | 'error';
  type: string;
  message: string;
  count: number;
}

export interface RecentSyncRun {
  id: number;
  sync_history_id: number | null;
  schedule_id: number;
  schedule_name: string;
  sync_type: string;
  triggered_by: 'scheduled' | 'manual';
  started_at: string;
  completed_at: string | null;
  status: string;
  success: boolean;
  records_synced: number;
  error_message: string | null;
}

export interface UpcomingSchedule {
  id: number;
  name: string;
  sync_type: string;
  next_run_at: string;
  collection_name: string | null;
  plugin_instance_name: string | null;
}

export interface OverdueSchedule {
  id: number;
  name: string;
  next_run_at: string;
  overdue_by: string;
}

export interface PluginFailure {
  id: number;
  instance_name: string;
  component_name: string;
  started_at: string;
  error_message: string | null;
}

export interface SystemReports {
  time_range: {
    days: number;
    from: string;
    to: string;
  };
  documents: {
    total: number;
    by_state: Record<string, number>;
    sync_enabled: number;
    failed: number;
    in_review: number;
  };
  sync_schedules: {
    total: number;
    enabled: number;
    overdue: OverdueSchedule[];
    upcoming: UpcomingSchedule[];
  };
  sync_runs: {
    total: number;
    successful: number;
    failed: number;
    success_rate: number;
    recent: RecentSyncRun[];
  };
  plugins: {
    installed: number;
    total: number;
    active_instances: number;
    executions: {
      total: number;
      successful: number;
      failed: number;
    };
    recent_failures: PluginFailure[];
  };
  collections: {
    total: number;
    with_documents: number;
  };
  alerts: SystemReportsAlert[];
}

// System Reports API functions
export const reportsApi = {
  getReports: (days?: number) =>
    apiClient.get<SystemReports>('/api/system/reports/', { params: days ? { days } : undefined }),
};

// Sync Schedule API functions
export const syncSchedulesApi = {
  list: (params?: { collection?: number; sync_type?: string; enabled?: boolean; plugin_instance?: number }) =>
    apiClient.get<PaginatedResponse<SyncSchedule>>('/api/sync-schedules/', { params }),
  get: (id: number) => apiClient.get<SyncSchedule>(`/api/sync-schedules/${id}/`),
  create: (data: {
    name: string;
    sync_type: 'full_collection' | 'selective' | 'data_source';
    collection?: number | null;
    plugin_instance?: number | null;
    enabled?: boolean;
    cron_expression: string;
  }) => apiClient.post<SyncSchedule>('/api/sync-schedules/', data),
  update: (id: number, data: {
    name?: string;
    sync_type?: 'full_collection' | 'selective' | 'data_source';
    collection?: number | null;
    plugin_instance?: number | null;
    enabled?: boolean;
    cron_expression?: string;
  }) => apiClient.patch<SyncSchedule>(`/api/sync-schedules/${id}/`, data),
  delete: (id: number) => apiClient.delete(`/api/sync-schedules/${id}/`),
  runNow: (id: number) =>
    apiClient.post<SyncScheduleRunNowResult>(`/api/sync-schedules/${id}/run-now/`),
  getHistory: (id: number) =>
    apiClient.get<SyncScheduleHistoryResult>(`/api/sync-schedules/${id}/history/`),
  getAllRuns: (limit?: number) =>
    apiClient.get<AllRunsResult>('/api/sync-schedules/all-runs/', { params: limit ? { limit } : undefined }),
  getPresets: () =>
    apiClient.get<SyncSchedulePresets>('/api/sync-schedules/presets/'),
  getDataSourceInstances: () =>
    apiClient.get<DataSourceInstancesResult>('/api/sync-schedules/data-source-instances/'),
};
