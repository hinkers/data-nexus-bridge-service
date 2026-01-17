import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { systemApi, webhooksApi, type AffindaSettings, type WebhookConfig } from '../api/client';

function SettingsPage() {
  const queryClient = useQueryClient();
  const [updateResult, setUpdateResult] = useState<{ success: boolean; message: string } | null>(null);

  // Affinda settings state
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [organizationInput, setOrganizationInput] = useState('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [affindaResult, setAffindaResult] = useState<{ success: boolean; message: string } | null>(null);

  // Webhook settings state
  const [webhookResult, setWebhookResult] = useState<{ success: boolean; message: string } | null>(null);
  const [pendingWebhookEnabled, setPendingWebhookEnabled] = useState<boolean | null>(null);
  const [pendingEnabledEvents, setPendingEnabledEvents] = useState<string[] | null>(null);

  // Queries
  const { data: versionInfo, isLoading: loadingVersion } = useQuery({
    queryKey: ['system', 'version'],
    queryFn: async () => {
      const response = await systemApi.getVersion();
      return response.data;
    },
  });

  const { data: systemStatus, isLoading: loadingStatus } = useQuery({
    queryKey: ['system', 'status'],
    queryFn: async () => {
      const response = await systemApi.getStatus();
      return response.data;
    },
  });

  const {
    data: updateCheck,
    isLoading: loadingUpdateCheck,
    refetch: recheckUpdates,
    isFetching: checkingUpdates,
  } = useQuery({
    queryKey: ['system', 'updates'],
    queryFn: async () => {
      const response = await systemApi.checkUpdates();
      return response.data;
    },
    // Don't auto-fetch, user should trigger it
    enabled: false,
  });

  // Affinda settings query
  const { data: affindaSettings, isLoading: loadingAffindaSettings } = useQuery({
    queryKey: ['system', 'affinda'],
    queryFn: async () => {
      const response = await systemApi.getAffindaSettings();
      return response.data;
    },
  });

  // Webhook settings query
  const { data: webhookConfig, isLoading: loadingWebhookConfig } = useQuery({
    queryKey: ['system', 'webhooks'],
    queryFn: async () => {
      const response = await webhooksApi.getConfig();
      return response.data;
    },
  });

  // Mutations
  const updateAffindaSettingsMutation = useMutation({
    mutationFn: async (data: { api_key?: string; base_url?: string; organization?: string }) => {
      const response = await systemApi.updateAffindaSettings(data);
      return response.data;
    },
    onSuccess: () => {
      setAffindaResult({ success: true, message: 'Settings saved successfully!' });
      setShowApiKeyInput(false);
      setApiKeyInput('');
      queryClient.invalidateQueries({ queryKey: ['system', 'affinda'] });
    },
    onError: (error: any) => {
      setAffindaResult({
        success: false,
        message: error.response?.data?.detail || error.message || 'Failed to save settings',
      });
    },
  });

  const testAffindaConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await systemApi.testAffindaConnection();
      return response.data;
    },
    onSuccess: (data) => {
      setAffindaResult({ success: data.success, message: data.message });
    },
    onError: (error: any) => {
      setAffindaResult({
        success: false,
        message: error.response?.data?.message || error.message || 'Connection test failed',
      });
    },
  });

  const clearAffindaApiKeyMutation = useMutation({
    mutationFn: async () => {
      const response = await systemApi.clearAffindaApiKey();
      return response.data;
    },
    onSuccess: (data) => {
      setAffindaResult({ success: data.success, message: data.message });
      queryClient.invalidateQueries({ queryKey: ['system', 'affinda'] });
    },
    onError: (error: any) => {
      setAffindaResult({
        success: false,
        message: error.response?.data?.message || error.message || 'Failed to clear API key',
      });
    },
  });

  // Webhook mutations
  const updateWebhookConfigMutation = useMutation({
    mutationFn: async (data: { enabled?: boolean; enabled_events?: string[] }) => {
      const response = await webhooksApi.updateConfig(data);
      return response.data;
    },
    onSuccess: () => {
      setWebhookResult({ success: true, message: 'Webhook settings saved successfully!' });
      setPendingWebhookEnabled(null);
      setPendingEnabledEvents(null);
      queryClient.invalidateQueries({ queryKey: ['system', 'webhooks'] });
    },
    onError: (error: any) => {
      setWebhookResult({
        success: false,
        message: error.response?.data?.detail || error.message || 'Failed to save webhook settings',
      });
    },
  });

  const regenerateWebhookTokenMutation = useMutation({
    mutationFn: async () => {
      const response = await webhooksApi.regenerateToken();
      return response.data;
    },
    onSuccess: () => {
      setWebhookResult({ success: true, message: 'Webhook token regenerated. Make sure to update your Affinda webhook settings.' });
      queryClient.invalidateQueries({ queryKey: ['system', 'webhooks'] });
    },
    onError: (error: any) => {
      setWebhookResult({
        success: false,
        message: error.response?.data?.detail || error.message || 'Failed to regenerate token',
      });
    },
  });

  const applyUpdatesMutation = useMutation({
    mutationFn: async () => {
      const response = await systemApi.applyUpdates();
      return response.data;
    },
    onSuccess: (data) => {
      if (data.success) {
        setUpdateResult({
          success: true,
          message: data.requires_restart
            ? 'Update successful! Please restart the application to apply changes.'
            : 'Update successful!',
        });
        // Refresh version info
        queryClient.invalidateQueries({ queryKey: ['system'] });
      } else {
        setUpdateResult({
          success: false,
          message: data.error || 'Update failed',
        });
      }
    },
    onError: (error: any) => {
      setUpdateResult({
        success: false,
        message: error.response?.data?.error || error.message || 'Update failed',
      });
    },
  });

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown';
    try {
      return new Date(dateStr).toLocaleString();
    } catch {
      return dateStr;
    }
  };

  const getDatabaseName = (engine: string) => {
    if (engine.includes('sqlite')) return 'SQLite';
    if (engine.includes('mssql') || engine.includes('sql_server')) return 'SQL Server';
    if (engine.includes('postgresql')) return 'PostgreSQL';
    if (engine.includes('mysql')) return 'MySQL';
    return engine;
  };

  const handleSaveAffindaSettings = () => {
    const data: { api_key?: string; base_url?: string; organization?: string } = {};
    if (apiKeyInput) data.api_key = apiKeyInput;
    if (baseUrlInput) data.base_url = baseUrlInput;
    if (organizationInput) data.organization = organizationInput;

    if (Object.keys(data).length === 0) {
      setAffindaResult({ success: false, message: 'No changes to save' });
      return;
    }

    updateAffindaSettingsMutation.mutate(data);
  };

  const getApiKeySourceBadge = (source: AffindaSettings['api_key_source']) => {
    switch (source) {
      case 'database':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-700">Database</span>;
      case 'environment':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">Environment Variable</span>;
      case 'not_set':
        return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">Not Set</span>;
    }
  };

  // Get effective webhook enabled state (pending or actual)
  const effectiveWebhookEnabled = pendingWebhookEnabled ?? webhookConfig?.enabled ?? false;

  // Get effective enabled events (pending or actual)
  const effectiveEnabledEvents = pendingEnabledEvents ?? webhookConfig?.enabled_events ?? [];

  const handleWebhookEnabledChange = (enabled: boolean) => {
    setPendingWebhookEnabled(enabled);
  };

  const handleEventToggle = (eventType: string) => {
    const currentEvents = effectiveEnabledEvents;
    if (currentEvents.includes(eventType)) {
      setPendingEnabledEvents(currentEvents.filter(e => e !== eventType));
    } else {
      setPendingEnabledEvents([...currentEvents, eventType]);
    }
  };

  const handleSaveWebhookSettings = () => {
    const data: { enabled?: boolean; enabled_events?: string[] } = {};
    if (pendingWebhookEnabled !== null) data.enabled = pendingWebhookEnabled;
    if (pendingEnabledEvents !== null) data.enabled_events = pendingEnabledEvents;

    if (Object.keys(data).length === 0) {
      setWebhookResult({ success: false, message: 'No changes to save' });
      return;
    }

    updateWebhookConfigMutation.mutate(data);
  };

  const hasWebhookChanges = pendingWebhookEnabled !== null || pendingEnabledEvents !== null;

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setWebhookResult({ success: true, message: 'Copied to clipboard!' });
    } catch {
      setWebhookResult({ success: false, message: 'Failed to copy to clipboard' });
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600">System information and application settings</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Version Information */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Version Information</h2>

          {loadingVersion ? (
            <div className="text-gray-500">Loading version info...</div>
          ) : versionInfo ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Application Version</span>
                <span className="font-medium">{versionInfo.app_version}</span>
              </div>

              {versionInfo.git.is_git_repo ? (
                <>
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Branch</span>
                    <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                      {versionInfo.git.current_branch}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Commit</span>
                    <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                      {versionInfo.git.current_commit_short}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Last Updated</span>
                    <span className="text-sm">{formatDate(versionInfo.git.last_commit_date)}</span>
                  </div>

                  {versionInfo.git.last_commit_message && (
                    <div className="py-2 border-b border-gray-100">
                      <span className="text-gray-600 block mb-1">Last Commit</span>
                      <span className="text-sm text-gray-800">
                        {versionInfo.git.last_commit_message}
                      </span>
                    </div>
                  )}

                  {versionInfo.git.has_uncommitted_changes && (
                    <div className="flex items-center gap-2 py-2 px-3 bg-amber-50 rounded-lg">
                      <svg
                        className="w-5 h-5 text-amber-500"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <span className="text-sm text-amber-800">You have uncommitted changes</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-gray-500 text-sm">Not a git repository</div>
              )}
            </div>
          ) : (
            <div className="text-red-500">Failed to load version info</div>
          )}
        </div>

        {/* System Status */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Status</h2>

          {loadingStatus ? (
            <div className="text-gray-500">Loading system status...</div>
          ) : systemStatus ? (
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Database</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      systemStatus.database.status === 'connected'
                        ? 'bg-green-500'
                        : 'bg-red-500'
                    }`}
                  />
                  <span className="font-medium">
                    {getDatabaseName(systemStatus.database.engine)}
                  </span>
                </div>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Available Plugins</span>
                <span className="font-medium">{systemStatus.plugins.available}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Installed Plugins</span>
                <span className="font-medium">{systemStatus.plugins.installed}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Active Instances</span>
                <span className="font-medium">{systemStatus.plugins.active_instances}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-gray-600">Debug Mode</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    systemStatus.debug_mode
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-100 text-green-700'
                  }`}
                >
                  {systemStatus.debug_mode ? 'Enabled' : 'Disabled'}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-red-500">Failed to load system status</div>
          )}
        </div>

        {/* Affinda API Settings */}
        <div className="bg-white rounded-xl p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Affinda API Settings</h2>

          {/* Result Message */}
          {affindaResult && (
            <div
              className={`mb-4 p-4 rounded-lg ${
                affindaResult.success
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className={affindaResult.success ? 'text-green-700' : 'text-red-700'}>
                  {affindaResult.message}
                </p>
                <button
                  onClick={() => setAffindaResult(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {loadingAffindaSettings ? (
            <div className="text-gray-500">Loading settings...</div>
          ) : affindaSettings ? (
            <div className="space-y-6">
              {/* Current Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600">API Key Status</span>
                    {getApiKeySourceBadge(affindaSettings.api_key_source)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        affindaSettings.is_configured ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <span className="text-gray-900">
                      {affindaSettings.is_configured ? (
                        <span className="font-mono text-sm">{affindaSettings.api_key}</span>
                      ) : (
                        'Not configured'
                      )}
                    </span>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-600 block mb-2">Base URL</span>
                  <span className="font-mono text-sm text-gray-900">{affindaSettings.base_url}</span>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg md:col-span-2">
                  <span className="text-sm font-medium text-gray-600 block mb-2">Organization ID</span>
                  <span className="text-gray-900">
                    {affindaSettings.organization || (
                      <span className="text-gray-400 italic">Not set (using AFFINDA_ORG_ID env var)</span>
                    )}
                  </span>
                </div>
              </div>

              {/* Update Settings */}
              <div className="border-t pt-6">
                <h3 className="text-sm font-medium text-gray-700 mb-4">Update Settings</h3>

                <div className="space-y-4">
                  {/* API Key */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">API Key</label>
                    {showApiKeyInput ? (
                      <div className="flex gap-2">
                        <input
                          type="password"
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          placeholder="Enter your Affinda API key"
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        />
                        <button
                          onClick={() => {
                            setShowApiKeyInput(false);
                            setApiKeyInput('');
                          }}
                          className="px-3 py-2 text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowApiKeyInput(true)}
                          className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition"
                        >
                          {affindaSettings.is_configured ? 'Change API Key' : 'Set API Key'}
                        </button>
                        {affindaSettings.api_key_source === 'database' && (
                          <button
                            onClick={() => clearAffindaApiKeyMutation.mutate()}
                            disabled={clearAffindaApiKeyMutation.isPending}
                            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition disabled:opacity-50"
                          >
                            {clearAffindaApiKeyMutation.isPending ? 'Clearing...' : 'Clear (Use Env Var)'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Base URL */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Base URL</label>
                    <input
                      type="text"
                      value={baseUrlInput}
                      onChange={(e) => setBaseUrlInput(e.target.value)}
                      placeholder={affindaSettings.base_url || 'https://api.affinda.com'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>

                  {/* Organization */}
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Organization ID</label>
                    <input
                      type="text"
                      value={organizationInput}
                      onChange={(e) => setOrganizationInput(e.target.value)}
                      placeholder={affindaSettings.organization || 'Your Affinda organization ID'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleSaveAffindaSettings}
                    disabled={updateAffindaSettingsMutation.isPending}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
                  >
                    {updateAffindaSettingsMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => testAffindaConnectionMutation.mutate()}
                    disabled={testAffindaConnectionMutation.isPending || !affindaSettings.is_configured}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
                  >
                    {testAffindaConnectionMutation.isPending ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-red-500">Failed to load Affinda settings</div>
          )}
        </div>

        {/* Webhook Configuration */}
        <div className="bg-white rounded-xl p-6 shadow-sm lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Webhook Configuration</h2>

          {/* Result Message */}
          {webhookResult && (
            <div
              className={`mb-4 p-4 rounded-lg ${
                webhookResult.success
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <p className={webhookResult.success ? 'text-green-700' : 'text-red-700'}>
                  {webhookResult.message}
                </p>
                <button
                  onClick={() => setWebhookResult(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {loadingWebhookConfig ? (
            <div className="text-gray-500">Loading webhook settings...</div>
          ) : webhookConfig ? (
            <div className="space-y-6">
              {/* Help Text */}
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium mb-1">How to configure webhooks:</p>
                    <ol className="list-decimal list-inside space-y-1 text-blue-700">
                      <li>Copy the webhook URL below</li>
                      <li>Go to your Affinda workspace settings</li>
                      <li>Navigate to the Webhooks section</li>
                      <li>Add a new webhook and paste the URL</li>
                      <li>Select the events you want to trigger the webhook</li>
                    </ol>
                  </div>
                </div>
              </div>

              {/* Webhook URL */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-2">Webhook URL</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookConfig.webhook_url}
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg font-mono text-sm"
                  />
                  <button
                    onClick={() => copyToClipboard(webhookConfig.webhook_url)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => regenerateWebhookTokenMutation.mutate()}
                    disabled={regenerateWebhookTokenMutation.isPending}
                    className="px-4 py-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition disabled:opacity-50"
                    title="Regenerate token (will invalidate old URL)"
                  >
                    {regenerateWebhookTokenMutation.isPending ? (
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  The regenerate button will create a new token and invalidate the old URL.
                </p>
              </div>

              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium text-gray-900">Enable Webhooks</span>
                  <p className="text-sm text-gray-500">When enabled, incoming webhooks will be processed</p>
                </div>
                <button
                  onClick={() => handleWebhookEnabledChange(!effectiveWebhookEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    effectiveWebhookEnabled ? 'bg-purple-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      effectiveWebhookEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Event Types */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-3">Enabled Events</label>
                <p className="text-sm text-gray-500 mb-3">
                  Select which Affinda events should trigger document syncs
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {webhookConfig.available_events.map((event) => (
                    <label
                      key={event.event_type}
                      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition"
                    >
                      <input
                        type="checkbox"
                        checked={effectiveEnabledEvents.includes(event.event_type)}
                        onChange={() => handleEventToggle(event.event_type)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <div>
                        <span className="font-mono text-sm text-gray-900">{event.event_type}</span>
                        <p className="text-xs text-gray-500 mt-0.5">{event.description}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <div className="flex gap-3 pt-4 border-t">
                <button
                  onClick={handleSaveWebhookSettings}
                  disabled={!hasWebhookChanges || updateWebhookConfigMutation.isPending}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updateWebhookConfigMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                {hasWebhookChanges && (
                  <button
                    onClick={() => {
                      setPendingWebhookEnabled(null);
                      setPendingEnabledEvents(null);
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-red-500">Failed to load webhook settings</div>
          )}
        </div>

        {/* Updates Section */}
        <div className="bg-white rounded-xl p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Software Updates</h2>
            <button
              onClick={() => recheckUpdates()}
              disabled={checkingUpdates}
              className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
            >
              {checkingUpdates ? 'Checking...' : 'Check for Updates'}
            </button>
          </div>

          {/* Update Result Message */}
          {updateResult && (
            <div
              className={`mb-4 p-4 rounded-lg ${
                updateResult.success
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-red-50 border border-red-200'
              }`}
            >
              <div className="flex items-start gap-3">
                {updateResult.success ? (
                  <svg
                    className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
                <div>
                  <p
                    className={`font-medium ${
                      updateResult.success ? 'text-green-800' : 'text-red-800'
                    }`}
                  >
                    {updateResult.success ? 'Update Complete' : 'Update Failed'}
                  </p>
                  <p
                    className={`text-sm mt-1 ${
                      updateResult.success ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {updateResult.message}
                  </p>
                </div>
                <button
                  onClick={() => setUpdateResult(null)}
                  className="ml-auto text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {!updateCheck && !checkingUpdates && (
            <div className="text-center py-8 text-gray-500">
              <svg
                className="w-12 h-12 mx-auto mb-3 text-gray-300"
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
              <p>Click "Check for Updates" to see if a new version is available</p>
            </div>
          )}

          {checkingUpdates && (
            <div className="text-center py-8 text-gray-500">
              <svg
                className="animate-spin w-8 h-8 mx-auto mb-3 text-purple-600"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <p>Checking for updates...</p>
            </div>
          )}

          {updateCheck && !checkingUpdates && (
            <div>
              {updateCheck.error ? (
                <div className="p-4 bg-red-50 rounded-lg text-red-700">
                  <p className="font-medium">Error checking for updates</p>
                  <p className="text-sm mt-1">{updateCheck.error}</p>
                </div>
              ) : updateCheck.update_available ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                    <svg
                      className="w-6 h-6 text-blue-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                      />
                    </svg>
                    <div className="flex-1">
                      <p className="font-medium text-blue-800">Update Available</p>
                      <p className="text-sm text-blue-700">
                        You are {updateCheck.commits_behind} commit
                        {updateCheck.commits_behind !== 1 ? 's' : ''} behind
                        {updateCheck.commits_ahead ? (
                          <> and {updateCheck.commits_ahead} commit
                          {updateCheck.commits_ahead !== 1 ? 's' : ''} ahead</>
                        ) : null}
                      </p>
                    </div>
                    <button
                      onClick={() => applyUpdatesMutation.mutate()}
                      disabled={applyUpdatesMutation.isPending}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {applyUpdatesMutation.isPending ? 'Updating...' : 'Update Now'}
                    </button>
                  </div>

                  {updateCheck.new_commits && updateCheck.new_commits.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 mb-2">New commits:</h3>
                      <div className="bg-gray-50 rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                        {updateCheck.new_commits.map((commit) => (
                          <div key={commit.hash} className="flex items-start gap-2 text-sm">
                            <span className="font-mono text-xs bg-gray-200 px-1.5 py-0.5 rounded text-gray-600">
                              {commit.hash}
                            </span>
                            <span className="text-gray-700">{commit.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                  <svg
                    className="w-6 h-6 text-green-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  <div>
                    <p className="font-medium text-green-800">You're up to date!</p>
                    <p className="text-sm text-green-700">
                      You have the latest version on branch {updateCheck.current_branch}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
