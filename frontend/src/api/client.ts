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
  workspace_name: string;
  collection_name: string;
  state: string;
  in_review: boolean;
  failed: boolean;
  ready: boolean;
  created_dt: string;
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
  list: (workspace?: string) =>
    apiClient.get<PaginatedResponse<Collection>>('/api/collections/', {
      params: workspace ? { workspace } : undefined,
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
