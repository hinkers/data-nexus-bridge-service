import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { reportsApi, syncHistoryApi, type SystemReports, type SystemReportsAlert, type SyncLogEntry } from '../api/client';

const TIME_RANGE_OPTIONS = [
  { value: 1, label: 'Last 24 hours' },
  { value: 7, label: 'Last 7 days' },
  { value: 14, label: 'Last 14 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 90 days' },
];

function ReportsPage() {
  const [selectedDays, setSelectedDays] = useState(7);
  const [selectedSyncId, setSelectedSyncId] = useState<number | null>(null);
  const [logLevelFilter, setLogLevelFilter] = useState<string>('');

  const { data: reports, isLoading, error, refetch } = useQuery({
    queryKey: ['system', 'reports', selectedDays],
    queryFn: async () => {
      const response = await reportsApi.getReports(selectedDays);
      return response.data;
    },
  });

  const { data: syncLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['sync-logs', selectedSyncId, logLevelFilter],
    queryFn: async () => {
      if (!selectedSyncId) return null;
      const response = await syncHistoryApi.getLogs(
        selectedSyncId,
        logLevelFilter ? { level: logLevelFilter } : undefined
      );
      return response.data;
    },
    enabled: !!selectedSyncId,
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMins > 0) {
      if (diffMins < 60) return `in ${diffMins}m`;
      if (diffHours < 24) return `in ${diffHours}h`;
      return `in ${diffDays}d`;
    } else {
      const absMins = Math.abs(diffMins);
      const absHours = Math.abs(diffHours);
      const absDays = Math.abs(diffDays);
      if (absMins < 60) return `${absMins}m ago`;
      if (absHours < 24) return `${absHours}h ago`;
      return `${absDays}d ago`;
    }
  };

  const getAlertIcon = (level: SystemReportsAlert['level']) => {
    switch (level) {
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const getAlertBgColor = (level: SystemReportsAlert['level']) => {
    switch (level) {
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-amber-50 border-amber-200';
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  const getHealthStatus = (reports: SystemReports) => {
    const hasErrors = reports.alerts.some(a => a.level === 'error');
    const hasWarnings = reports.alerts.some(a => a.level === 'warning');

    if (hasErrors) {
      return { status: 'Critical', color: 'text-red-600', bgColor: 'bg-red-100', borderColor: 'border-red-200' };
    }
    if (hasWarnings) {
      return { status: 'Warning', color: 'text-amber-600', bgColor: 'bg-amber-100', borderColor: 'border-amber-200' };
    }
    return { status: 'Healthy', color: 'text-green-600', bgColor: 'bg-green-100', borderColor: 'border-green-200' };
  };

  const getLogLevelStyle = (level: SyncLogEntry['level']) => {
    switch (level) {
      case 'error':
        return { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' };
      case 'warning':
        return { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' };
      case 'info':
        return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' };
      case 'debug':
        return { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-200' };
    }
  };

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Failed to load reports</h2>
          <p className="text-red-600">{(error as Error).message}</p>
          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 lg:p-12 w-full">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">System Health</h1>
          <p className="text-gray-600">Overview of sync operations and document status</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedDays}
            onChange={(e) => setSelectedDays(Number(e.target.value))}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            {TIME_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <svg className="animate-spin w-8 h-8 text-purple-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : reports ? (
        <div className="space-y-6">
          {/* Health Status Banner */}
          {reports.alerts.length > 0 && (
            <div className={`rounded-xl p-4 border ${getHealthStatus(reports).bgColor} ${getHealthStatus(reports).borderColor}`}>
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-lg font-semibold ${getHealthStatus(reports).color}`}>
                  System Status: {getHealthStatus(reports).status}
                </span>
              </div>
              <div className="space-y-2">
                {reports.alerts.map((alert, index) => (
                  <div
                    key={index}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${getAlertBgColor(alert.level)}`}
                  >
                    {getAlertIcon(alert.level)}
                    <div className="flex-1">
                      <span className="text-gray-800">{alert.message}</span>
                      {alert.count > 1 && (
                        <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-600">
                          {alert.count} items
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {reports.alerts.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
              <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-800 font-medium">All systems operational - no issues detected</span>
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="text-sm font-medium text-gray-500 mb-1">Documents</div>
              <div className="text-3xl font-bold text-gray-900">{reports.documents.total}</div>
              <div className="text-xs text-gray-500 mt-1">
                {reports.documents.sync_enabled} sync enabled
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="text-sm font-medium text-gray-500 mb-1">Sync Success Rate</div>
              <div className={`text-3xl font-bold ${
                reports.sync_runs.success_rate >= 90 ? 'text-green-600' :
                reports.sync_runs.success_rate >= 70 ? 'text-amber-600' : 'text-red-600'
              }`}>
                {reports.sync_runs.success_rate.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {reports.sync_runs.successful}/{reports.sync_runs.total} runs
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="text-sm font-medium text-gray-500 mb-1">Active Schedules</div>
              <div className="text-3xl font-bold text-gray-900">{reports.sync_schedules.enabled}</div>
              <div className="text-xs text-gray-500 mt-1">
                of {reports.sync_schedules.total} total
              </div>
            </div>
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="text-sm font-medium text-gray-500 mb-1">Plugin Executions</div>
              <div className="text-3xl font-bold text-gray-900">{reports.plugins.executions.total}</div>
              <div className="text-xs text-gray-500 mt-1">
                {reports.plugins.executions.failed > 0 && (
                  <span className="text-red-500">{reports.plugins.executions.failed} failed</span>
                )}
                {reports.plugins.executions.failed === 0 && 'All successful'}
              </div>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sync Schedules Section */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Sync Schedules</h2>
                <Link
                  to="/dashboard/sync-schedules"
                  className="text-sm text-purple-600 hover:text-purple-700"
                >
                  View all
                </Link>
              </div>

              {/* Overdue Schedules */}
              {reports.sync_schedules.overdue.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-red-600 mb-2">Overdue</h3>
                  <div className="space-y-2">
                    {reports.sync_schedules.overdue.map((schedule) => (
                      <div
                        key={schedule.id}
                        className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100"
                      >
                        <div>
                          <span className="font-medium text-gray-900">{schedule.name}</span>
                        </div>
                        <span className="text-sm text-red-600">{schedule.overdue_by} overdue</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming Schedules */}
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-2">Upcoming</h3>
                {reports.sync_schedules.upcoming.length > 0 ? (
                  <div className="space-y-2">
                    {reports.sync_schedules.upcoming.slice(0, 5).map((schedule) => (
                      <div
                        key={schedule.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <span className="font-medium text-gray-900">{schedule.name}</span>
                          <span className="text-xs text-gray-500 ml-2">
                            ({schedule.sync_type.replace('_', ' ')})
                          </span>
                        </div>
                        <span className="text-sm text-gray-600">
                          {formatRelativeTime(schedule.next_run_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">No upcoming schedules</p>
                )}
              </div>
            </div>

            {/* Document Status Section */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Document Status</h2>
                <Link
                  to="/dashboard/documents"
                  className="text-sm text-purple-600 hover:text-purple-700"
                >
                  View all
                </Link>
              </div>

              <div className="space-y-3">
                {Object.entries(reports.documents.by_state).map(([state, count]) => (
                  <div key={state} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        state === 'review' ? 'bg-amber-500' :
                        state === 'failed' ? 'bg-red-500' :
                        state === 'ready' || state === 'complete' ? 'bg-green-500' :
                        'bg-gray-400'
                      }`} />
                      <span className="text-gray-700 capitalize">{state}</span>
                    </div>
                    <span className="font-medium text-gray-900">{count}</span>
                  </div>
                ))}

                <div className="border-t pt-3 mt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">In Review</span>
                    <span className={`font-medium ${reports.documents.in_review > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                      {reports.documents.in_review}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-gray-600">Failed</span>
                    <span className={`font-medium ${reports.documents.failed > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {reports.documents.failed}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Sync Runs Section */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Sync Runs</h2>
              <p className="text-xs text-gray-500 mb-3">Click on a sync to view detailed logs</p>

              {reports.sync_runs.recent.length > 0 ? (
                <div className="space-y-3">
                  {reports.sync_runs.recent.map((run) => (
                    <button
                      key={run.id}
                      onClick={() => run.sync_history_id && setSelectedSyncId(run.sync_history_id)}
                      disabled={!run.sync_history_id}
                      className={`w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg transition text-left ${
                        run.sync_history_id ? 'hover:bg-gray-100 cursor-pointer' : 'opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${
                          run.success ? 'bg-green-500' : 'bg-red-500'
                        }`} />
                        <div>
                          <span className="font-medium text-gray-900">{run.schedule_name}</span>
                          <span className="text-xs text-gray-500 ml-2">
                            {run.triggered_by === 'scheduled' ? 'Auto' : 'Manual'}
                          </span>
                          <div className="text-xs text-gray-500">
                            {formatRelativeTime(run.started_at)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex items-center gap-2">
                        <div>
                          <span className={`text-sm font-medium ${run.success ? 'text-green-600' : 'text-red-600'}`}>
                            {run.success ? 'Success' : 'Failed'}
                          </span>
                          {run.records_synced > 0 && (
                            <div className="text-xs text-gray-500">{run.records_synced} synced</div>
                          )}
                        </div>
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No sync runs in this time period</p>
              )}
            </div>

            {/* Plugin Health Section */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Plugin Health</h2>
                <Link
                  to="/dashboard/plugins"
                  className="text-sm text-purple-600 hover:text-purple-700"
                >
                  View all
                </Link>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{reports.plugins.installed}</div>
                  <div className="text-xs text-gray-500">Installed</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{reports.plugins.active_instances}</div>
                  <div className="text-xs text-gray-500">Active Instances</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className={`text-2xl font-bold ${
                    reports.plugins.executions.failed > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {reports.plugins.executions.failed}
                  </div>
                  <div className="text-xs text-gray-500">Failed Execs</div>
                </div>
              </div>

              {reports.plugins.recent_failures.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-red-600 mb-2">Recent Failures</h3>
                  <div className="space-y-2">
                    {reports.plugins.recent_failures.map((failure) => (
                      <div
                        key={failure.id}
                        className="p-3 bg-red-50 rounded-lg border border-red-100"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-900">{failure.instance_name}</span>
                          <span className="text-xs text-gray-500">
                            {formatRelativeTime(failure.started_at)}
                          </span>
                        </div>
                        {failure.error_message && (
                          <p className="text-xs text-red-600 truncate">{failure.error_message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reports.plugins.recent_failures.length === 0 && reports.plugins.active_instances > 0 && (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  All plugins running smoothly
                </div>
              )}
            </div>
          </div>

          {/* Document Types Summary */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Document Types Overview</h2>
            <div className="flex items-center gap-8">
              <div>
                <span className="text-3xl font-bold text-gray-900">{reports.collections.total}</span>
                <span className="text-gray-500 ml-2">Total Document Types</span>
              </div>
              <div>
                <span className="text-3xl font-bold text-gray-900">{reports.collections.with_documents}</span>
                <span className="text-gray-500 ml-2">With Documents</span>
              </div>
            </div>
          </div>

          {/* Time Range Info */}
          <div className="text-center text-sm text-gray-500">
            Showing data from {formatDate(reports.time_range.from)} to {formatDate(reports.time_range.to)}
          </div>
        </div>
      ) : null}

      {/* Sync Logs Modal */}
      {selectedSyncId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Sync Logs</h2>
                {syncLogs && (
                  <p className="text-sm text-gray-500">
                    {syncLogs.sync_type.replace('_', ' ')} - {syncLogs.status}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={logLevelFilter}
                  onChange={(e) => setLogLevelFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                >
                  <option value="">All levels</option>
                  <option value="error">Errors only</option>
                  <option value="warning">Warnings</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
                <button
                  onClick={() => {
                    setSelectedSyncId(null);
                    setLogLevelFilter('');
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {logsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <svg className="animate-spin w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : syncLogs && syncLogs.entries.length > 0 ? (
                <div className="space-y-2">
                  {syncLogs.entries.map((entry) => {
                    const style = getLogLevelStyle(entry.level);
                    return (
                      <div
                        key={entry.id}
                        className={`p-3 rounded-lg border ${style.bg} ${style.border}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded uppercase ${style.text}`}>
                                {entry.level}
                              </span>
                              {entry.document_identifier && (
                                <span className="text-xs text-gray-500 font-mono">
                                  {entry.document_identifier}
                                </span>
                              )}
                            </div>
                            <p className={`text-sm ${style.text}`}>{entry.message}</p>
                            {entry.details && Object.keys(entry.details).length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                                  View details
                                </summary>
                                <pre className="mt-2 p-2 bg-white/50 rounded text-xs overflow-x-auto">
                                  {JSON.stringify(entry.details, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 whitespace-nowrap">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-gray-500">
                  {logLevelFilter ? (
                    <p>No {logLevelFilter} log entries found</p>
                  ) : (
                    <p>No log entries recorded for this sync</p>
                  )}
                </div>
              )}
            </div>

            {syncLogs && (
              <div className="p-4 border-t bg-gray-50 rounded-b-xl">
                <p className="text-sm text-gray-600">
                  Total entries: {syncLogs.total_entries}
                  {logLevelFilter && ` (filtered by ${logLevelFilter})`}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportsPage;
