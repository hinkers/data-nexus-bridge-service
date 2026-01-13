import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  pluginsApi,
  pluginComponentsApi,
  pluginInstancesApi,
  type Plugin,
  type AvailablePlugin,
  type PluginComponent,
  type PluginInstance,
} from '../api/client';

type TabType = 'installed' | 'available' | 'instances';

function PluginsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('installed');
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [showCreateInstance, setShowCreateInstance] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<PluginComponent | null>(null);
  const queryClient = useQueryClient();

  // Queries
  const { data: installedPlugins, isLoading: loadingInstalled } = useQuery({
    queryKey: ['plugins'],
    queryFn: async () => {
      const response = await pluginsApi.list();
      return response.data.results;
    },
  });

  const { data: availablePlugins, isLoading: loadingAvailable } = useQuery({
    queryKey: ['plugins', 'available'],
    queryFn: async () => {
      const response = await pluginsApi.available();
      return response.data;
    },
  });

  const { data: components } = useQuery({
    queryKey: ['plugin-components'],
    queryFn: async () => {
      const response = await pluginComponentsApi.list();
      return response.data.results;
    },
  });

  const { data: instances, isLoading: loadingInstances } = useQuery({
    queryKey: ['plugin-instances'],
    queryFn: async () => {
      const response = await pluginInstancesApi.list();
      return response.data.results;
    },
  });

  // Mutations
  const installMutation = useMutation({
    mutationFn: (slug: string) => pluginsApi.install(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugin-components'] });
    },
  });

  const uninstallMutation = useMutation({
    mutationFn: (slug: string) => pluginsApi.uninstall(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugin-components'] });
      queryClient.invalidateQueries({ queryKey: ['plugin-instances'] });
      setSelectedPlugin(null);
    },
  });

  const togglePluginMutation = useMutation({
    mutationFn: (slug: string) => pluginsApi.toggle(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  const toggleInstanceMutation = useMutation({
    mutationFn: (id: number) => pluginInstancesApi.toggle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-instances'] });
    },
  });

  const deleteInstanceMutation = useMutation({
    mutationFn: (id: number) => pluginInstancesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-instances'] });
      queryClient.invalidateQueries({ queryKey: ['plugin-components'] });
    },
  });

  const runImporterMutation = useMutation({
    mutationFn: (id: number) => pluginInstancesApi.run(id),
  });

  const createInstanceMutation = useMutation({
    mutationFn: (data: { component: number; name: string; config?: Record<string, any>; event_triggers?: string[] }) =>
      pluginInstancesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-instances'] });
      queryClient.invalidateQueries({ queryKey: ['plugin-components'] });
      setShowCreateInstance(false);
      setSelectedComponent(null);
    },
  });

  // Check if a plugin is installed
  const isInstalled = (slug: string) => {
    return installedPlugins?.some((p) => p.slug === slug) ?? false;
  };

  // Get component type badge color
  const getComponentTypeColor = (type: string) => {
    switch (type) {
      case 'importer':
        return 'bg-blue-100 text-blue-700';
      case 'preprocessor':
        return 'bg-yellow-100 text-yellow-700';
      case 'postprocessor':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getComponentTypeLabel = (type: string) => {
    switch (type) {
      case 'importer':
        return 'Importer';
      case 'preprocessor':
        return 'Pre-Processor';
      case 'postprocessor':
        return 'Post-Processor';
      default:
        return type;
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Plugins</h1>
        <p className="text-gray-600">Manage importers, pre-processors, and post-processors</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('installed')}
          className={`px-4 py-2 rounded-md font-medium transition ${
            activeTab === 'installed'
              ? 'bg-white text-purple-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Installed ({installedPlugins?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('available')}
          className={`px-4 py-2 rounded-md font-medium transition ${
            activeTab === 'available'
              ? 'bg-white text-purple-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Available ({availablePlugins?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('instances')}
          className={`px-4 py-2 rounded-md font-medium transition ${
            activeTab === 'instances'
              ? 'bg-white text-purple-600 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Instances ({instances?.length ?? 0})
        </button>
      </div>

      {/* Installed Plugins Tab */}
      {activeTab === 'installed' && (
        <div className="grid grid-cols-3 gap-6">
          {/* Plugin List */}
          <div className="col-span-2">
            {loadingInstalled ? (
              <div className="text-center py-12 text-gray-500">Loading plugins...</div>
            ) : installedPlugins?.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center">
                <p className="text-gray-500 mb-4">No plugins installed yet</p>
                <button
                  onClick={() => setActiveTab('available')}
                  className="text-purple-600 hover:text-purple-700 font-medium"
                >
                  Browse available plugins
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {installedPlugins?.map((plugin) => (
                  <div
                    key={plugin.slug}
                    onClick={() => setSelectedPlugin(plugin)}
                    className={`bg-white rounded-xl p-6 shadow-sm cursor-pointer transition hover:shadow-md ${
                      selectedPlugin?.slug === plugin.slug ? 'ring-2 ring-purple-500' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">{plugin.name}</h3>
                          <span className="text-sm text-gray-500">v{plugin.version}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              plugin.enabled
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {plugin.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        {plugin.author && (
                          <p className="text-sm text-gray-500 mb-2">by {plugin.author}</p>
                        )}
                        <p className="text-gray-600 text-sm">{plugin.description}</p>
                        <div className="flex gap-4 mt-3 text-sm text-gray-500">
                          <span>{plugin.components_count.importers} importers</span>
                          <span>{plugin.components_count.preprocessors} pre-processors</span>
                          <span>{plugin.components_count.postprocessors} post-processors</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePluginMutation.mutate(plugin.slug);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                            plugin.enabled
                              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                          }`}
                        >
                          {plugin.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Plugin Details */}
          <div className="col-span-1">
            {selectedPlugin ? (
              <div className="bg-white rounded-xl p-6 shadow-sm sticky top-8">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{selectedPlugin.name}</h3>

                <div className="space-y-4 mb-6">
                  <div>
                    <span className="text-sm text-gray-500">Version</span>
                    <p className="font-medium">{selectedPlugin.version}</p>
                  </div>
                  {selectedPlugin.author && (
                    <div>
                      <span className="text-sm text-gray-500">Author</span>
                      <p className="font-medium">{selectedPlugin.author}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-sm text-gray-500">Installed</span>
                    <p className="font-medium">
                      {new Date(selectedPlugin.installed_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <h4 className="text-sm font-semibold text-gray-700 mb-3">Components</h4>
                <div className="space-y-2 mb-6">
                  {components
                    ?.filter((c) => c.plugin_slug === selectedPlugin.slug)
                    .map((component) => (
                      <div
                        key={component.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <p className="font-medium text-sm">{component.name}</p>
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${getComponentTypeColor(
                              component.component_type
                            )}`}
                          >
                            {getComponentTypeLabel(component.component_type)}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setSelectedComponent(component);
                            setShowCreateInstance(true);
                          }}
                          className="text-purple-600 hover:text-purple-700 text-sm font-medium"
                        >
                          + Instance
                        </button>
                      </div>
                    ))}
                </div>

                <button
                  onClick={() => {
                    if (confirm(`Are you sure you want to uninstall ${selectedPlugin.name}?`)) {
                      uninstallMutation.mutate(selectedPlugin.slug);
                    }
                  }}
                  className="w-full px-4 py-2 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition"
                >
                  Uninstall Plugin
                </button>
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500">
                Select a plugin to view details
              </div>
            )}
          </div>
        </div>
      )}

      {/* Available Plugins Tab */}
      {activeTab === 'available' && (
        <div className="space-y-4">
          {loadingAvailable ? (
            <div className="text-center py-12 text-gray-500">Loading available plugins...</div>
          ) : availablePlugins?.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <p className="text-gray-500">No plugins available</p>
            </div>
          ) : (
            availablePlugins?.map((plugin: AvailablePlugin) => (
              <div key={plugin.slug} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{plugin.name}</h3>
                      <span className="text-sm text-gray-500">v{plugin.version}</span>
                      {isInstalled(plugin.slug) && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Installed
                        </span>
                      )}
                    </div>
                    {plugin.author && (
                      <p className="text-sm text-gray-500 mb-2">by {plugin.author}</p>
                    )}
                    <p className="text-gray-600 text-sm mb-4">{plugin.description}</p>

                    {/* Components Preview */}
                    <div className="flex flex-wrap gap-2">
                      {plugin.importers.map((imp) => (
                        <span
                          key={imp.slug}
                          className="px-2 py-1 text-xs rounded-full bg-blue-50 text-blue-600"
                          title={imp.description}
                        >
                          {imp.name}
                        </span>
                      ))}
                      {plugin.preprocessors.map((pre) => (
                        <span
                          key={pre.slug}
                          className="px-2 py-1 text-xs rounded-full bg-yellow-50 text-yellow-600"
                          title={pre.description}
                        >
                          {pre.name}
                        </span>
                      ))}
                      {plugin.postprocessors.map((post) => (
                        <span
                          key={post.slug}
                          className="px-2 py-1 text-xs rounded-full bg-green-50 text-green-600"
                          title={post.description}
                        >
                          {post.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    {isInstalled(plugin.slug) ? (
                      <button
                        disabled
                        className="px-4 py-2 bg-gray-100 text-gray-500 rounded-lg font-medium cursor-not-allowed"
                      >
                        Installed
                      </button>
                    ) : (
                      <button
                        onClick={() => installMutation.mutate(plugin.slug)}
                        disabled={installMutation.isPending}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50"
                      >
                        {installMutation.isPending ? 'Installing...' : 'Install'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Instances Tab */}
      {activeTab === 'instances' && (
        <div className="space-y-4">
          {loadingInstances ? (
            <div className="text-center py-12 text-gray-500">Loading instances...</div>
          ) : instances?.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <p className="text-gray-500 mb-4">No plugin instances configured yet</p>
              <button
                onClick={() => setActiveTab('installed')}
                className="text-purple-600 hover:text-purple-700 font-medium"
              >
                Create an instance from installed plugins
              </button>
            </div>
          ) : (
            instances?.map((instance) => (
              <div key={instance.id} className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{instance.name}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${getComponentTypeColor(
                          instance.component_type
                        )}`}
                      >
                        {getComponentTypeLabel(instance.component_type)}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          instance.enabled
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {instance.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-2">
                      {instance.plugin_name} / {instance.component_name}
                    </p>
                    <p className="text-sm text-gray-500">Priority: {instance.priority}</p>
                    {instance.event_triggers.length > 0 && (
                      <div className="mt-2 flex gap-1">
                        {instance.event_triggers.map((event) => (
                          <span
                            key={event}
                            className="px-2 py-0.5 text-xs rounded-full bg-purple-50 text-purple-600"
                          >
                            {event}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {instance.component_type === 'importer' && (
                      <button
                        onClick={() => runImporterMutation.mutate(instance.id)}
                        disabled={runImporterMutation.isPending || !instance.enabled}
                        className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200 transition disabled:opacity-50"
                      >
                        {runImporterMutation.isPending ? 'Running...' : 'Run'}
                      </button>
                    )}
                    <button
                      onClick={() => toggleInstanceMutation.mutate(instance.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        instance.enabled
                          ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                      }`}
                    >
                      {instance.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete instance "${instance.name}"?`)) {
                          deleteInstanceMutation.mutate(instance.id);
                        }
                      }}
                      className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Create Instance Modal */}
      {showCreateInstance && selectedComponent && (
        <CreateInstanceModal
          component={selectedComponent}
          onClose={() => {
            setShowCreateInstance(false);
            setSelectedComponent(null);
          }}
          onSubmit={(data) => createInstanceMutation.mutate(data)}
          isSubmitting={createInstanceMutation.isPending}
        />
      )}
    </div>
  );
}

// Create Instance Modal Component
function CreateInstanceModal({
  component,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  component: PluginComponent;
  onClose: () => void;
  onSubmit: (data: { component: number; name: string; config?: Record<string, any>; event_triggers?: string[] }) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState(`${component.name} Instance`);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [eventTriggers, setEventTriggers] = useState<string[]>([]);

  const availableEvents = [
    'document_uploaded',
    'document_approved',
    'document_rejected',
    'document_archived',
    'document_updated',
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      component: component.id,
      name,
      config: Object.keys(config).length > 0 ? config : undefined,
      event_triggers: component.component_type === 'postprocessor' ? eventTriggers : undefined,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Create Instance</h2>
        <p className="text-sm text-gray-500 mb-6">
          {component.plugin_name} / {component.name}
        </p>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instance Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                required
              />
            </div>

            {/* Event Triggers for Post-Processors */}
            {component.component_type === 'postprocessor' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Event Triggers</label>
                <div className="space-y-2">
                  {availableEvents.map((event) => (
                    <label key={event} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={eventTriggers.includes(event)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setEventTriggers([...eventTriggers, event]);
                          } else {
                            setEventTriggers(eventTriggers.filter((t) => t !== event));
                          }
                        }}
                        className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-700">{event.replace(/_/g, ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Config Schema Preview */}
            {Object.keys(component.config_schema).length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Configuration (JSON)
                </label>
                <textarea
                  value={JSON.stringify(config, null, 2)}
                  onChange={(e) => {
                    try {
                      setConfig(JSON.parse(e.target.value));
                    } catch {
                      // Invalid JSON, ignore
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm h-32 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="{}"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Configure this instance based on the component&apos;s schema
                </p>
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
              disabled={isSubmitting || !name.trim()}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Instance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PluginsPage;
