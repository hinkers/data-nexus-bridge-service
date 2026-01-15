import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { systemApi, type VersionInfo, type UpdateCheckResult, type SystemStatus } from '../api/client';

function SettingsPage() {
  const queryClient = useQueryClient();
  const [updateResult, setUpdateResult] = useState<{ success: boolean; message: string } | null>(null);

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

  // Mutations
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
