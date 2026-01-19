import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { reportsApi, syncSchedulesApi, type SystemReports } from '../api/client';

// Simple SVG icons
const Icons = {
  workspace: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  collection: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  document: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  sync: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  x: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  clock: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  arrowRight: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  ),
  plugin: (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
    </svg>
  ),
};

function DashboardPage() {
  // Fetch reports data (includes stats for last 7 days)
  const { data: reports, isLoading } = useQuery({
    queryKey: ['system', 'reports', 7],
    queryFn: async () => {
      const response = await reportsApi.getReports(7);
      return response.data;
    },
  });

  // Fetch all recent runs
  const { data: allRuns } = useQuery({
    queryKey: ['sync-schedules', 'all-runs'],
    queryFn: async () => {
      const response = await syncSchedulesApi.getAllRuns(5);
      return response.data;
    },
  });

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);
    const diffDays = Math.round(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const formatFutureTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.round(diffMs / 60000);
    const diffHours = Math.round(diffMs / 3600000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `in ${diffMins}m`;
    if (diffHours < 24) return `in ${diffHours}h`;
    return new Date(dateStr).toLocaleDateString();
  };

  const getHealthStatus = (reports: SystemReports) => {
    const hasErrors = reports.alerts.some(a => a.level === 'error');
    const hasWarnings = reports.alerts.some(a => a.level === 'warning');
    const syncSuccessRate = reports.sync_runs.success_rate;

    if (hasErrors || syncSuccessRate < 50) {
      return { status: 'critical', label: 'Needs Attention', color: 'text-red-600', bg: 'bg-red-100' };
    }
    if (hasWarnings || syncSuccessRate < 80) {
      return { status: 'warning', label: 'Some Issues', color: 'text-amber-600', bg: 'bg-amber-100' };
    }
    return { status: 'healthy', label: 'Healthy', color: 'text-green-600', bg: 'bg-green-100' };
  };

  const health = reports ? getHealthStatus(reports) : null;

  return (
    <div className="p-6 md:p-8 lg:p-10 w-full max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Overview of your Data Nexus Bridge</p>
      </div>

      {/* Health Status Banner */}
      {health && reports && (
        <div className={`mb-6 p-4 rounded-lg ${health.bg} flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${health.status === 'healthy' ? 'bg-green-200' : health.status === 'warning' ? 'bg-amber-200' : 'bg-red-200'}`}>
              {health.status === 'healthy' ? (
                <span className="text-green-600">{Icons.check}</span>
              ) : (
                <span className={health.status === 'warning' ? 'text-amber-600' : 'text-red-600'}>{Icons.warning}</span>
              )}
            </div>
            <div>
              <p className={`font-semibold ${health.color}`}>{health.label}</p>
              <p className="text-sm text-gray-600">
                {reports.sync_runs.success_rate.toFixed(0)}% sync success rate in the last 7 days
                {reports.alerts.length > 0 && ` · ${reports.alerts.length} alert${reports.alerts.length > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <Link
            to="/dashboard/reports"
            className="text-sm font-medium text-gray-700 hover:text-gray-900 flex items-center gap-1"
          >
            View Reports {Icons.arrowRight}
          </Link>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link
          to="/dashboard/collections"
          className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-5 shadow-lg shadow-purple-500/20 hover:shadow-xl hover:shadow-purple-500/30 hover:-translate-y-0.5 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold text-white">
                {isLoading ? '–' : reports?.collections.total || 0}
              </p>
              <p className="text-purple-100 text-sm">Collections</p>
            </div>
            <svg className="w-5 h-5 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        <Link
          to="/dashboard/documents"
          className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold text-white">
                {isLoading ? '–' : reports?.documents.total.toLocaleString() || 0}
              </p>
              <p className="text-blue-100 text-sm">Documents</p>
            </div>
            <svg className="w-5 h-5 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        <Link
          to="/dashboard/sync-schedules"
          className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 shadow-lg shadow-emerald-500/20 hover:shadow-xl hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold text-white">
                {isLoading ? '–' : reports?.sync_schedules.enabled || 0}
              </p>
              <p className="text-emerald-100 text-sm">Active Schedules</p>
            </div>
            <svg className="w-5 h-5 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>

        <Link
          to="/dashboard/plugins"
          className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl p-5 shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 hover:-translate-y-0.5 transition-all group"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm flex-shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-2xl font-bold text-white">
                {isLoading ? '–' : reports?.plugins.active_instances || 0}
              </p>
              <p className="text-amber-100 text-sm">Active Plugins</p>
            </div>
            <svg className="w-5 h-5 text-white/40 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sync Runs */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-5 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Recent Sync Runs</h2>
            <Link
              to="/dashboard/sync-schedules"
              className="text-sm text-purple-600 hover:text-purple-800 flex items-center gap-1"
            >
              View all {Icons.arrowRight}
            </Link>
          </div>
          <div className="p-2">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">Loading...</div>
            ) : allRuns?.runs && allRuns.runs.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {allRuns.runs.map((run) => (
                  <div key={run.id} className="p-3 hover:bg-gray-50 rounded-lg transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 text-sm">{run.schedule_name}</span>
                      <span className="text-xs text-gray-500">{formatRelativeTime(run.started_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                        run.sync_history_status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : run.sync_history_status === 'failed'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {run.sync_history_status === 'completed' && <span className="w-3 h-3">{Icons.check}</span>}
                        {run.sync_history_status === 'failed' && <span className="w-3 h-3">{Icons.x}</span>}
                        {run.sync_history_status}
                      </span>
                      <span className="text-xs text-gray-500">
                        {run.documents_synced} docs · {run.triggered_by}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                <div className="text-gray-300 mb-2">{Icons.sync}</div>
                <p>No sync runs yet</p>
                <Link to="/dashboard/sync-schedules" className="text-sm text-purple-600 hover:underline mt-1 inline-block">
                  Create a schedule
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming & Alerts */}
        <div className="space-y-6">
          {/* Next Scheduled */}
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-5 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Upcoming Syncs</h2>
            </div>
            <div className="p-2">
              {isLoading ? (
                <div className="p-4 text-center text-gray-500">Loading...</div>
              ) : reports?.sync_schedules.upcoming && reports.sync_schedules.upcoming.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {reports.sync_schedules.upcoming.slice(0, 3).map((schedule) => (
                    <div key={schedule.id} className="p-3 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{schedule.name}</p>
                        <p className="text-xs text-gray-500">
                          {schedule.sync_type === 'full_collection' ? 'Full sync' : schedule.sync_type === 'data_source' ? 'Data source' : 'Selective'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-purple-600">{formatFutureTime(schedule.next_run_at)}</p>
                        <p className="text-xs text-gray-400">{new Date(schedule.next_run_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-gray-500">
                  <div className="text-gray-300 mb-2">{Icons.clock}</div>
                  <p className="text-sm">No upcoming syncs</p>
                </div>
              )}
            </div>
          </div>

          {/* Alerts */}
          {reports && reports.alerts.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm">
              <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-semibold text-gray-900">Alerts</h2>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  {reports.alerts.length}
                </span>
              </div>
              <div className="p-2">
                <div className="divide-y divide-gray-50">
                  {reports.alerts.slice(0, 3).map((alert, i) => (
                    <div key={i} className={`p-3 rounded-lg ${
                      alert.level === 'error' ? 'bg-red-50' : alert.level === 'warning' ? 'bg-amber-50' : 'bg-blue-50'
                    }`}>
                      <div className="flex items-start gap-2">
                        <span className={alert.level === 'error' ? 'text-red-500' : alert.level === 'warning' ? 'text-amber-500' : 'text-blue-500'}>
                          {Icons.warning}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{alert.message}</p>
                          {alert.count > 1 && (
                            <p className="text-xs text-gray-500">{alert.count} occurrences</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {reports.alerts.length > 3 && (
                  <Link
                    to="/dashboard/reports"
                    className="block text-center text-sm text-purple-600 hover:text-purple-800 py-2"
                  >
                    View all {reports.alerts.length} alerts
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Last 7 Days</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {isLoading ? '–' : reports?.sync_runs.total || 0}
                </p>
                <p className="text-sm text-gray-500">Total Sync Runs</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {isLoading ? '–' : reports?.sync_runs.successful || 0}
                </p>
                <p className="text-sm text-gray-500">Successful</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">
                  {isLoading ? '–' : reports?.sync_runs.failed || 0}
                </p>
                <p className="text-sm text-gray-500">Failed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {isLoading ? '–' : `${reports?.sync_runs.success_rate.toFixed(0) || 0}%`}
                </p>
                <p className="text-sm text-gray-500">Success Rate</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
