import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  pluginsApi,
  pluginComponentsApi,
  pluginInstancesApi,
  pluginSourcesApi,
  type Plugin,
  type AvailablePlugin,
  type PluginComponent,
  type PluginInstance,
  type PluginSource,
} from '../api/client';

type TabType = 'installed' | 'available' | 'instances';

function PluginsPage() {
  useEffect(() => {
    document.title = 'Plugins - DNBS';
  }, []);

  const [activeTab, setActiveTab] = useState<TabType>('installed');
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [showCreateInstance, setShowCreateInstance] = useState(false);
  const [selectedComponent, setSelectedComponent] = useState<PluginComponent | null>(null);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [pluginToInstall, setPluginToInstall] = useState<AvailablePlugin | null>(null);
  const [showEditPluginConfig, setShowEditPluginConfig] = useState(false);
  const [showSourcesModal, setShowSourcesModal] = useState(false);
  const [showAddSource, setShowAddSource] = useState(false);
  const [selectedSource, setSelectedSource] = useState<PluginSource | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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

  const { data: sources, isLoading: loadingSources } = useQuery({
    queryKey: ['plugin-sources'],
    queryFn: async () => {
      const response = await pluginSourcesApi.list();
      return response.data.results;
    },
    enabled: showSourcesModal,
  });

  // Mutations
  const installMutation = useMutation({
    mutationFn: ({ slug, config }: { slug: string; config?: Record<string, any> }) =>
      pluginsApi.install(slug, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      queryClient.invalidateQueries({ queryKey: ['plugin-components'] });
      setShowInstallModal(false);
      setPluginToInstall(null);
    },
  });

  const updatePluginConfigMutation = useMutation({
    mutationFn: ({ slug, config }: { slug: string; config: Record<string, any> }) =>
      pluginsApi.updateConfig(slug, config),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
      setShowEditPluginConfig(false);
      // Update the selected plugin with new data
      if (selectedPlugin) {
        setSelectedPlugin(response.data);
      }
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

  const installDependenciesMutation = useMutation({
    mutationFn: (slug: string) => pluginsApi.installDependencies(slug),
    onSuccess: () => {
      // Refresh available plugins to get updated dependency status
      queryClient.invalidateQueries({ queryKey: ['plugins', 'available'] });
    },
  });

  const checkUpdatesMutation = useMutation({
    mutationFn: () => pluginsApi.checkUpdates(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  const updatePluginMutation = useMutation({
    mutationFn: (slug: string) => pluginsApi.update(slug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  // Plugin Sources Mutations
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

  const installFromSourceMutation = useMutation({
    mutationFn: ({ sourceSlug, pluginSlug }: { sourceSlug: string; pluginSlug: string }) =>
      pluginSourcesApi.installPlugin(sourceSlug, pluginSlug),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugin-sources'] });
      queryClient.invalidateQueries({ queryKey: ['plugins'] });
    },
  });

  // Count plugins with updates available
  const pluginsWithUpdates = installedPlugins?.filter(p => p.update_available).length ?? 0;

  // Check if a plugin is installed
  const isInstalled = (slug: string) => {
    return installedPlugins?.some((p) => p.slug === slug) ?? false;
  };

  // Filter functions for search
  const filterInstalledPlugins = (plugins: Plugin[] | undefined) => {
    if (!plugins || !searchQuery.trim()) return plugins;
    const query = searchQuery.toLowerCase();
    return plugins.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.slug.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.author?.toLowerCase().includes(query)
    );
  };

  const filterAvailablePlugins = (plugins: AvailablePlugin[] | undefined) => {
    if (!plugins || !searchQuery.trim()) return plugins;
    const query = searchQuery.toLowerCase();
    return plugins.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.slug.toLowerCase().includes(query) ||
        p.description?.toLowerCase().includes(query) ||
        p.author?.toLowerCase().includes(query) ||
        p.importers.some((i) => i.name.toLowerCase().includes(query)) ||
        p.preprocessors.some((i) => i.name.toLowerCase().includes(query)) ||
        p.postprocessors.some((i) => i.name.toLowerCase().includes(query))
    );
  };

  const filterInstances = (instances: PluginInstance[] | undefined) => {
    if (!instances || !searchQuery.trim()) return instances;
    const query = searchQuery.toLowerCase();
    return instances.filter(
      (i) =>
        i.name.toLowerCase().includes(query) ||
        i.plugin_name.toLowerCase().includes(query) ||
        i.component_name.toLowerCase().includes(query) ||
        i.component_type.toLowerCase().includes(query)
    );
  };

  // Get filtered data
  const filteredInstalledPlugins = filterInstalledPlugins(installedPlugins);
  const filteredAvailablePlugins = filterAvailablePlugins(availablePlugins);
  const filteredInstances = filterInstances(instances);

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
    <div className="p-6 md:p-8 lg:p-10 w-full">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Plugins</h1>
        <p className="text-gray-500 mt-1">Manage importers, pre-processors, and post-processors</p>
      </div>

      {/* Tabs and Search */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => { setActiveTab('installed'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-md font-medium transition ${
              activeTab === 'installed'
                ? 'bg-white text-purple-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Installed ({installedPlugins?.length ?? 0})
          </button>
          <button
            onClick={() => { setActiveTab('available'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-md font-medium transition ${
              activeTab === 'available'
                ? 'bg-white text-purple-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Available ({availablePlugins?.length ?? 0})
          </button>
          <button
            onClick={() => { setActiveTab('instances'); setSearchQuery(''); }}
            className={`px-4 py-2 rounded-md font-medium transition ${
              activeTab === 'instances'
                ? 'bg-white text-purple-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Instances ({instances?.length ?? 0})
          </button>
        </div>

        {/* Search and Actions */}
        <div className="flex items-center gap-3">
          {/* Plugin Sources Button */}
          <button
            onClick={() => setShowSourcesModal(true)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
            </svg>
            Plugin Sources
          </button>

          {/* Check for Updates Button */}
          <button
            onClick={() => checkUpdatesMutation.mutate()}
            disabled={checkUpdatesMutation.isPending}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition flex items-center gap-2 disabled:opacity-50"
          >
            <svg
              className={`w-4 h-4 ${checkUpdatesMutation.isPending ? 'animate-spin' : ''}`}
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
            {checkUpdatesMutation.isPending ? 'Checking...' : 'Check Updates'}
            {pluginsWithUpdates > 0 && (
              <span className="px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded-full">
                {pluginsWithUpdates}
              </span>
            )}
          </button>

          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab}...`}
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
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
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
            ) : filteredInstalledPlugins?.length === 0 ? (
              <div className="bg-white rounded-xl p-8 text-center">
                <p className="text-gray-500">No plugins match "{searchQuery}"</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredInstalledPlugins?.map((plugin) => (
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
                          {plugin.update_available && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                              Update: v{plugin.available_version}
                            </span>
                          )}
                          {plugin.source_name && (
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600">
                              {plugin.source_name}
                            </span>
                          )}
                        </div>
                        {plugin.author && (
                          <p className="text-sm text-gray-500 mb-2">by {plugin.author}</p>
                        )}
                        <p className="text-gray-600 text-sm">{plugin.description}</p>
                        <div className="flex gap-4 mt-3 text-sm text-gray-500">
                          <span>{plugin.components_count.importers} importers</span>
                          <span>{plugin.components_count.preprocessors} pre-processors</span>
                          <span>{plugin.components_count.postprocessors} post-processors</span>
                          <span>{plugin.components_count.datasources} data sources</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {plugin.update_available && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              updatePluginMutation.mutate(plugin.slug);
                            }}
                            disabled={updatePluginMutation.isPending}
                            className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg text-sm font-medium hover:bg-orange-200 transition disabled:opacity-50"
                          >
                            {updatePluginMutation.isPending ? 'Updating...' : 'Update'}
                          </button>
                        )}
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

                {/* Plugin Configuration */}
                {Object.keys(selectedPlugin.config_schema?.properties || {}).length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-700">Plugin Configuration</h4>
                      <button
                        onClick={() => setShowEditPluginConfig(true)}
                        className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                      >
                        Edit
                      </button>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      {Object.entries(selectedPlugin.config_schema?.properties || {}).map(
                        ([key, schema]) => {
                          const value = selectedPlugin.config?.[key];
                          const schemaObj = schema as Record<string, any>;
                          const label = schemaObj.title || key.replace(/_/g, ' ');
                          return (
                            <div key={key} className="flex justify-between text-sm">
                              <span className="text-gray-500 capitalize">{label}:</span>
                              <span className="font-medium text-gray-900">
                                {value !== undefined
                                  ? typeof value === 'boolean'
                                    ? value ? 'Yes' : 'No'
                                    : String(value)
                                  : schemaObj.default !== undefined
                                    ? `${schemaObj.default} (default)`
                                    : '-'}
                              </span>
                            </div>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}

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
          ) : filteredAvailablePlugins?.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <p className="text-gray-500">No plugins match "{searchQuery}"</p>
            </div>
          ) : (
            filteredAvailablePlugins?.map((plugin: AvailablePlugin) => (
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

                    {/* Dependencies Warning */}
                    {plugin.dependencies?.length > 0 && !plugin.dependencies_satisfied && (
                      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-2">
                          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-amber-800">Missing Dependencies</p>
                            <p className="text-xs text-amber-700 mt-1">
                              This plugin requires: {plugin.missing_dependencies.join(', ')}
                            </p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                installDependenciesMutation.mutate(plugin.slug);
                              }}
                              disabled={installDependenciesMutation.isPending}
                              className="mt-2 px-3 py-1 text-xs bg-amber-600 text-white rounded font-medium hover:bg-amber-700 transition disabled:opacity-50"
                            >
                              {installDependenciesMutation.isPending ? 'Installing...' : 'Install Dependencies'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {isInstalled(plugin.slug) ? (
                      <button
                        disabled
                        className="px-4 py-2 bg-gray-100 text-gray-500 rounded-lg font-medium cursor-not-allowed"
                      >
                        Installed
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          // If plugin has config schema, show modal; otherwise install directly
                          if (Object.keys(plugin.config_schema?.properties || {}).length > 0) {
                            setPluginToInstall(plugin);
                            setShowInstallModal(true);
                          } else {
                            installMutation.mutate({ slug: plugin.slug });
                          }
                        }}
                        disabled={installMutation.isPending || !plugin.dependencies_satisfied}
                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50"
                        title={!plugin.dependencies_satisfied ? 'Install dependencies first' : ''}
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
          ) : filteredInstances?.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center">
              <p className="text-gray-500">No instances match "{searchQuery}"</p>
            </div>
          ) : (
            filteredInstances?.map((instance) => (
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

      {/* Install Plugin Modal */}
      {showInstallModal && pluginToInstall && (
        <InstallPluginModal
          plugin={pluginToInstall}
          onClose={() => {
            setShowInstallModal(false);
            setPluginToInstall(null);
          }}
          onSubmit={(config) => installMutation.mutate({ slug: pluginToInstall.slug, config })}
          isSubmitting={installMutation.isPending}
        />
      )}

      {/* Edit Plugin Config Modal */}
      {showEditPluginConfig && selectedPlugin && (
        <EditPluginConfigModal
          plugin={selectedPlugin}
          onClose={() => setShowEditPluginConfig(false)}
          onSubmit={(config) =>
            updatePluginConfigMutation.mutate({ slug: selectedPlugin.slug, config })
          }
          isSubmitting={updatePluginConfigMutation.isPending}
        />
      )}

      {/* Plugin Sources Modal */}
      {showSourcesModal && (
        <PluginSourcesModal
          sources={sources}
          isLoading={loadingSources}
          selectedSource={selectedSource}
          onSelectSource={setSelectedSource}
          onClose={() => {
            setShowSourcesModal(false);
            setSelectedSource(null);
          }}
          onAddSource={() => setShowAddSource(true)}
          onRefresh={(slug) => refreshSourceMutation.mutate(slug)}
          onToggle={(slug) => toggleSourceMutation.mutate(slug)}
          onDelete={(slug) => deleteSourceMutation.mutate(slug)}
          onInstallPlugin={(sourceSlug, pluginSlug) =>
            installFromSourceMutation.mutate({ sourceSlug, pluginSlug })
          }
          isRefreshing={refreshSourceMutation.isPending}
          isInstalling={installFromSourceMutation.isPending}
        />
      )}

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

// Helper to extract default values from JSON Schema
function getDefaultsFromSchema(schema: Record<string, any>): Record<string, any> {
  const defaults: Record<string, any> = {};
  const properties = schema.properties || {};

  for (const [key, prop] of Object.entries(properties)) {
    const propSchema = prop as Record<string, any>;
    if (propSchema.default !== undefined) {
      defaults[key] = propSchema.default;
    } else if (propSchema.type === 'boolean') {
      defaults[key] = false;
    } else if (propSchema.type === 'number' || propSchema.type === 'integer') {
      defaults[key] = 0;
    } else if (propSchema.type === 'array') {
      defaults[key] = [];
    } else if (propSchema.type === 'object') {
      defaults[key] = {};
    }
  }

  return defaults;
}

// Schema Field Component
function SchemaField({
  name,
  schema,
  value,
  onChange,
  required,
}: {
  name: string;
  schema: Record<string, any>;
  value: any;
  onChange: (value: any) => void;
  required: boolean;
}) {
  const type = schema.type || 'string';
  const description = schema.description || '';
  const label = schema.title || name.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

  const inputClasses =
    'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent';

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {type === 'boolean' ? (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value || false}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <span className="text-sm text-gray-600">{description || 'Enable'}</span>
        </label>
      ) : type === 'number' || type === 'integer' ? (
        <input
          type="number"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
          className={inputClasses}
          step={type === 'integer' ? 1 : 'any'}
          required={required}
        />
      ) : schema.enum ? (
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={inputClasses}
          required={required}
        >
          <option value="">Select...</option>
          {schema.enum.map((opt: string) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : type === 'array' && schema.items?.type === 'string' ? (
        <input
          type="text"
          value={Array.isArray(value) ? value.join(', ') : ''}
          onChange={(e) =>
            onChange(
              e.target.value
                ? e.target.value.split(',').map((s) => s.trim())
                : []
            )
          }
          className={inputClasses}
          placeholder="Comma-separated values"
        />
      ) : (
        <input
          type="text"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={inputClasses}
          placeholder={schema.default ? `Default: ${schema.default}` : ''}
          required={required}
        />
      )}

      {description && type !== 'boolean' && (
        <p className="text-xs text-gray-500 mt-1">{description}</p>
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
  const schema = component.config_schema || {};
  const properties = schema.properties || {};
  const requiredFields: string[] = schema.required || [];
  const hasSchema = Object.keys(properties).length > 0;

  const [name, setName] = useState(`${component.name} Instance`);
  const [config, setConfig] = useState<Record<string, any>>(() => getDefaultsFromSchema(schema));
  const [eventTriggers, setEventTriggers] = useState<string[]>([]);
  const [showRawJson, setShowRawJson] = useState(false);

  const availableEvents = [
    'document_uploaded',
    'document_approved',
    'document_rejected',
    'document_archived',
    'document_updated',
  ];

  const updateConfigField = (field: string, value: any) => {
    setConfig((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '') {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  };

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

            {/* Configuration Fields */}
            {hasSchema && (
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-semibold text-gray-700">Configuration</label>
                  <button
                    type="button"
                    onClick={() => setShowRawJson(!showRawJson)}
                    className="text-xs text-purple-600 hover:text-purple-700"
                  >
                    {showRawJson ? 'Show Form' : 'Edit as JSON'}
                  </button>
                </div>

                {showRawJson ? (
                  <div>
                    <textarea
                      value={JSON.stringify(config, null, 2)}
                      onChange={(e) => {
                        try {
                          setConfig(JSON.parse(e.target.value));
                        } catch {
                          // Invalid JSON, ignore
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm h-48 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(properties).map(([fieldName, fieldSchema]) => (
                      <SchemaField
                        key={fieldName}
                        name={fieldName}
                        schema={fieldSchema as Record<string, any>}
                        value={config[fieldName]}
                        onChange={(value) => updateConfigField(fieldName, value)}
                        required={requiredFields.includes(fieldName)}
                      />
                    ))}
                  </div>
                )}
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

// Install Plugin Modal Component
function InstallPluginModal({
  plugin,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  plugin: AvailablePlugin;
  onClose: () => void;
  onSubmit: (config: Record<string, any>) => void;
  isSubmitting: boolean;
}) {
  const schema = plugin.config_schema || {};
  const properties = schema.properties || {};
  const requiredFields: string[] = schema.required || [];

  const [config, setConfig] = useState<Record<string, any>>(() => getDefaultsFromSchema(schema));
  const [showRawJson, setShowRawJson] = useState(false);

  const updateConfigField = (field: string, value: any) => {
    setConfig((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '') {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(config);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Install {plugin.name}</h2>
        <p className="text-sm text-gray-500 mb-6">
          Configure plugin settings before installation. These can be changed later.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-gray-700">Plugin Configuration</label>
              <button
                type="button"
                onClick={() => setShowRawJson(!showRawJson)}
                className="text-xs text-purple-600 hover:text-purple-700"
              >
                {showRawJson ? 'Show Form' : 'Edit as JSON'}
              </button>
            </div>

            {showRawJson ? (
              <textarea
                value={JSON.stringify(config, null, 2)}
                onChange={(e) => {
                  try {
                    setConfig(JSON.parse(e.target.value));
                  } catch {
                    // Invalid JSON, ignore
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm h-48 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            ) : (
              <div className="space-y-4">
                {Object.entries(properties).map(([fieldName, fieldSchema]) => (
                  <SchemaField
                    key={fieldName}
                    name={fieldName}
                    schema={fieldSchema as Record<string, any>}
                    value={config[fieldName]}
                    onChange={(value) => updateConfigField(fieldName, value)}
                    required={requiredFields.includes(fieldName)}
                  />
                ))}
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
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Installing...' : 'Install Plugin'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Edit Plugin Config Modal Component
function EditPluginConfigModal({
  plugin,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  plugin: Plugin;
  onClose: () => void;
  onSubmit: (config: Record<string, any>) => void;
  isSubmitting: boolean;
}) {
  const schema = plugin.config_schema || {};
  const properties = schema.properties || {};
  const requiredFields: string[] = schema.required || [];

  // Initialize with current plugin config, falling back to defaults
  const [config, setConfig] = useState<Record<string, any>>(() => ({
    ...getDefaultsFromSchema(schema),
    ...plugin.config,
  }));
  const [showRawJson, setShowRawJson] = useState(false);

  const updateConfigField = (field: string, value: any) => {
    setConfig((prev) => {
      const next = { ...prev };
      if (value === undefined || value === '') {
        delete next[field];
      } else {
        next[field] = value;
      }
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(config);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Edit {plugin.name} Configuration</h2>
        <p className="text-sm text-gray-500 mb-6">
          Update plugin-level settings. These apply to all instances of this plugin.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-semibold text-gray-700">Configuration</label>
              <button
                type="button"
                onClick={() => setShowRawJson(!showRawJson)}
                className="text-xs text-purple-600 hover:text-purple-700"
              >
                {showRawJson ? 'Show Form' : 'Edit as JSON'}
              </button>
            </div>

            {showRawJson ? (
              <textarea
                value={JSON.stringify(config, null, 2)}
                onChange={(e) => {
                  try {
                    setConfig(JSON.parse(e.target.value));
                  } catch {
                    // Invalid JSON, ignore
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm h-48 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            ) : (
              <div className="space-y-4">
                {Object.entries(properties).map(([fieldName, fieldSchema]) => (
                  <SchemaField
                    key={fieldName}
                    name={fieldName}
                    schema={fieldSchema as Record<string, any>}
                    value={config[fieldName]}
                    onChange={(value) => updateConfigField(fieldName, value)}
                    required={requiredFields.includes(fieldName)}
                  />
                ))}
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
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Plugin Sources Modal Component
function PluginSourcesModal({
  sources,
  isLoading,
  selectedSource,
  onSelectSource,
  onClose,
  onAddSource,
  onRefresh,
  onToggle,
  onDelete,
  onInstallPlugin,
  isRefreshing,
  isInstalling,
}: {
  sources: PluginSource[] | undefined;
  isLoading: boolean;
  selectedSource: PluginSource | null;
  onSelectSource: (source: PluginSource | null) => void;
  onClose: () => void;
  onAddSource: () => void;
  onRefresh: (slug: string) => void;
  onToggle: (slug: string) => void;
  onDelete: (slug: string) => void;
  onInstallPlugin: (sourceSlug: string, pluginSlug: string) => void;
  isRefreshing: boolean;
  isInstalling: boolean;
}) {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Plugin Sources</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage plugin repositories and install plugins from URLs
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onAddSource}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Source
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Source List */}
          <div className="w-2/3 border-r border-gray-200 overflow-y-auto p-4">
            {isLoading ? (
              <div className="text-center py-12 text-gray-500">Loading sources...</div>
            ) : sources?.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 mb-4">No plugin sources configured</p>
                <button
                  onClick={onAddSource}
                  className="text-purple-600 hover:text-purple-700 font-medium"
                >
                  Add your first source
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sources?.map((source) => (
                  <div
                    key={source.slug}
                    onClick={() => onSelectSource(source)}
                    className={`bg-gray-50 rounded-xl p-4 cursor-pointer transition hover:bg-gray-100 ${
                      selectedSource?.slug === source.slug ? 'ring-2 ring-purple-500 bg-purple-50' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold text-gray-900 truncate">{source.name}</h3>
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
                        <p className="text-xs text-gray-500 font-mono truncate">{source.url}</p>
                        {source.error_message && (
                          <p className="text-xs text-red-500 mt-1 truncate">{source.error_message}</p>
                        )}
                        <div className="flex gap-3 mt-2 text-xs text-gray-500">
                          <span>{source.plugins_count} installed</span>
                          <span>{source.available_plugins?.length || 0} available</span>
                        </div>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRefresh(source.slug);
                          }}
                          disabled={isRefreshing}
                          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition"
                          title="Refresh"
                        >
                          <svg
                            className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`}
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
                            onToggle(source.slug);
                          }}
                          className={`p-1.5 rounded transition ${
                            source.enabled
                              ? 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                              : 'text-purple-400 hover:text-purple-600 hover:bg-purple-50'
                          }`}
                          title={source.enabled ? 'Disable' : 'Enable'}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {source.enabled ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            )}
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Source Details */}
          <div className="w-1/3 overflow-y-auto p-4 bg-gray-50">
            {selectedSource ? (
              <div>
                <h3 className="font-semibold text-gray-900 mb-4">{selectedSource.name}</h3>

                <div className="space-y-3 mb-6 text-sm">
                  <div>
                    <span className="text-gray-500 block text-xs mb-1">URL</span>
                    <p className="font-mono text-xs break-all">{selectedSource.url}</p>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-xs mb-1">Type</span>
                    <p className="font-medium capitalize">{selectedSource.source_type}</p>
                  </div>
                  {selectedSource.latest_version && (
                    <div>
                      <span className="text-gray-500 block text-xs mb-1">Latest Version</span>
                      <p className="font-medium">{selectedSource.latest_version}</p>
                    </div>
                  )}
                </div>

                <h4 className="text-sm font-semibold text-gray-700 mb-2">Available Plugins</h4>
                {selectedSource.available_plugins?.length === 0 ? (
                  <p className="text-xs text-gray-500 mb-4">No plugins available. Try refreshing.</p>
                ) : (
                  <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                    {selectedSource.available_plugins?.map((plugin) => (
                      <div
                        key={plugin.slug}
                        className="flex items-center justify-between p-2 bg-white rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{plugin.name}</p>
                          <p className="text-xs text-gray-500">v{plugin.version}</p>
                        </div>
                        {plugin.installed ? (
                          <span className="text-xs text-green-600 font-medium">Installed</span>
                        ) : (
                          <button
                            onClick={() => onInstallPlugin(selectedSource.slug, plugin.slug)}
                            disabled={isInstalling}
                            className="text-purple-600 hover:text-purple-700 text-xs font-medium"
                          >
                            {isInstalling ? '...' : 'Install'}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {selectedSource.source_type === 'user' && (
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${selectedSource.name}?`)) {
                        onDelete(selectedSource.slug);
                      }
                    }}
                    className="w-full px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition"
                  >
                    Remove Source
                  </button>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 text-sm">
                Select a source to view details
              </div>
            )}
          </div>
        </div>
      </div>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
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

export default PluginsPage;
