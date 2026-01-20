import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  pluginSourcesApi,
  type PluginSource,
} from '../api/client';

function PluginSourcesPage() {
  const [selectedSource, setSelectedSource] = useState<PluginSource | null>(null);
  const [showAddSource, setShowAddSource] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const queryClient = useQueryClient();

  // Queries
  const { data: sources, isLoading } = useQuery({
    queryKey: ['plugin-sources'],
    queryFn: async () => {
      const response = await pluginSourcesApi.list();
      return response.data.results;
    },
  });

  // Mutations
  const addSourceMutation = useMutation({
    mutationFn: ({ url, name }: { url: string; name?: string }) =>
      pluginSourcesApi.add(url, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-sources'] });
      setShowAddSource(false);
    },
  });

  const deleteSourceMutation = useMutation({
    mutationFn: (slug: string) => pluginSourcesApi.delete(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-sources'] });
      setSelectedSource(null);
    },
  });

  const toggleSourceMutation = useMutation({
    mutationFn: (slug: string) => pluginSourcesApi.toggle(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-sources'] });
    },
  });

  const refreshSourceMutation = useMutation({
    mutationFn: (slug: string) => pluginSourcesApi.refresh(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-sources'] });
    },
  });

  const installPluginMutation = useMutation({
    mutationFn: ({ sourceSlug, pluginSlug }: { sourceSlug: string; pluginSlug: string }) =>
      pluginSourcesApi.installPlugin(sourceSlug, pluginSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-sources'] });
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  // Filter sources
  const filteredSources = sources?.filter((source) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      source.name.toLowerCase().includes(query) ||
      source.slug.toLowerCase().includes(query) ||
      source.url.toLowerCase().includes(query)
    );
  });

  // Get source type badge
  const getSourceTypeBadge = (type: string) => {
    if (type === 'builtin') {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
          Built-in
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        User
      </span>
    );
  };

  return (
    <div className="p-6 md:p-8 lg:p-10 w-full">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Plugin Sources</h1>
        <p className="text-gray-500 mt-1">Manage plugin repositories and install plugins from URLs</p>
      </div>

      {/* Header Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sources..."
            className="w-64 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <button
          onClick={() => setShowAddSource(true)}
          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Source
        </button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Source List */}
        <div className="col-span-2">
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Loading sources...</div>
          ) : sources?.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <p className="text-gray-500 mb-4">No plugin sources configured</p>
              <button
                onClick={() => setShowAddSource(true)}
                className="text-purple-600 hover:text-purple-700 font-medium"
              >
                Add your first source
              </button>
            </div>
          ) : filteredSources?.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <p className="text-gray-500">No sources match "{searchQuery}"</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredSources?.map((source) => (
                <div
                  key={source.slug}
                  onClick={() => setSelectedSource(source)}
                  className={`bg-white rounded-xl p-6 shadow-sm cursor-pointer transition hover:shadow-md ${
                    selectedSource?.slug === source.slug ? 'ring-2 ring-purple-500' : ''
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{source.name}</h3>
                        {getSourceTypeBadge(source.source_type)}
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            source.enabled
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {source.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                        {source.is_multi_plugin && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                            Multi-plugin
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mb-2 font-mono truncate">{source.url}</p>
                      {source.error_message && (
                        <p className="text-sm text-red-500 mb-2">{source.error_message}</p>
                      )}
                      <div className="flex gap-4 mt-3 text-sm text-gray-500">
                        <span>{source.plugins_count} plugins installed</span>
                        <span>{source.available_plugins?.length || 0} available</span>
                        {source.last_checked_at && (
                          <span>
                            Checked: {new Date(source.last_checked_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          refreshSourceMutation.mutate(source.slug);
                        }}
                        disabled={refreshSourceMutation.isPending}
                        className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"
                        title="Refresh"
                      >
                        <svg
                          className={`w-5 h-5 ${refreshSourceMutation.isPending ? 'animate-spin' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSourceMutation.mutate(source.slug);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                          source.enabled
                            ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                        }`}
                      >
                        {source.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Source Details */}
        <div className="col-span-1">
          {selectedSource ? (
            <div className="bg-white rounded-xl p-6 shadow-sm sticky top-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{selectedSource.name}</h3>

              <div className="space-y-4 mb-6">
                <div>
                  <span className="text-sm text-gray-500">URL</span>
                  <p className="font-mono text-sm break-all">{selectedSource.url}</p>
                </div>
                <div>
                  <span className="text-sm text-gray-500">Type</span>
                  <p className="font-medium capitalize">{selectedSource.source_type}</p>
                </div>
                {selectedSource.latest_version && (
                  <div>
                    <span className="text-sm text-gray-500">Latest Version</span>
                    <p className="font-medium">{selectedSource.latest_version}</p>
                  </div>
                )}
                <div>
                  <span className="text-sm text-gray-500">Added</span>
                  <p className="font-medium">
                    {new Date(selectedSource.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Available Plugins */}
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Available Plugins</h4>
              {selectedSource.available_plugins?.length === 0 ? (
                <p className="text-sm text-gray-500 mb-6">No plugins available. Try refreshing.</p>
              ) : (
                <div className="space-y-2 mb-6 max-h-80 overflow-y-auto">
                  {selectedSource.available_plugins?.map((plugin) => (
                    <div
                      key={plugin.slug}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{plugin.name}</p>
                        <p className="text-xs text-gray-500">v{plugin.version}</p>
                      </div>
                      {plugin.installed ? (
                        <span className="text-xs text-green-600 font-medium">Installed</span>
                      ) : (
                        <button
                          onClick={() =>
                            installPluginMutation.mutate({
                              sourceSlug: selectedSource.slug,
                              pluginSlug: plugin.slug,
                            })
                          }
                          disabled={installPluginMutation.isPending}
                          className="text-purple-600 hover:text-purple-700 text-sm font-medium"
                        >
                          {installPluginMutation.isPending ? 'Installing...' : 'Install'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Delete Button (only for user sources) */}
              {selectedSource.source_type === 'user' && (
                <button
                  onClick={() => {
                    if (confirm(`Are you sure you want to remove ${selectedSource.name}?`)) {
                      deleteSourceMutation.mutate(selectedSource.slug);
                    }
                  }}
                  className="w-full px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition"
                >
                  Remove Source
                </button>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
              Select a source to view details
            </div>
          )}
        </div>
      </div>

      {/* Add Source Modal */}
      {showAddSource && (
        <AddSourceModal
          onClose={() => setShowAddSource(false)}
          onSubmit={(url, name) => addSourceMutation.mutate({ url, name })}
          isSubmitting={addSourceMutation.isPending}
          error={addSourceMutation.error?.message}
        />
      )}
    </div>
  );
}

// Add Source Modal Component
function AddSourceModal({
  onClose,
  onSubmit,
  isSubmitting,
  error,
}: {
  onClose: () => void;
  onSubmit: (url: string, name?: string) => void;
  isSubmitting: boolean;
  error?: string;
}) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(url, name || undefined);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Add Plugin Source</h2>
        <p className="text-sm text-gray-500 mb-6">
          Add a GitHub repository URL or direct download link to discover and install plugins.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Repository URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Supports GitHub repository URLs. The repo should contain a datanexus-plugins.json or
                datanexus-plugin.json manifest.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Plugin Source"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                If not provided, a name will be generated from the URL.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !url.trim()}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Adding...' : 'Add Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PluginSourcesPage;
