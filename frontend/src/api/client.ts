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
  started_at: string;
  completed_at: string | null;
  success: boolean;
  records_synced: number;
  error_message: string;
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

export const collectionsApi = {
  list: (params?: { workspace?: string }) =>
    apiClient.get<PaginatedResponse<Collection>>('/api/collections/', {
      params,
    }),
  get: (identifier: string) => apiClient.get<Collection>(`/api/collections/${identifier}/`),
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

export const documentsApi = {
  list: (params?: { workspace?: string; collection?: string; state?: string }) =>
    apiClient.get<PaginatedResponse<Document>>('/api/documents/', { params }),
  get: (id: number) => apiClient.get<Document>(`/api/documents/${id}/`),
};

export const syncHistoryApi = {
  latest: () => apiClient.get<LatestSyncs>('/api/sync-history/latest/'),
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

// System API functions
export const systemApi = {
  getVersion: () => apiClient.get<VersionInfo>('/api/system/version/'),
  getStatus: () => apiClient.get<SystemStatus>('/api/system/status/'),
  checkUpdates: () => apiClient.get<UpdateCheckResult>('/api/system/updates/check/'),
  applyUpdates: () => apiClient.post<UpdateApplyResult>('/api/system/updates/apply/'),
};
