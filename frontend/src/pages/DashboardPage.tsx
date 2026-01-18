import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { workspacesApi, collectionsApi, documentsApi, syncSchedulesApi, type SyncSchedule } from '../api/client';

interface DashboardStats {
  workspaces: number;
  collections: number;
  documents: number;
}

interface SyncScheduleInfo {
  nextSchedule: SyncSchedule | null;
  lastRun: { schedule: SyncSchedule; runAt: string; success: boolean } | null;
}

function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    workspaces: 0,
    collections: 0,
    documents: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [scheduleInfo, setScheduleInfo] = useState<SyncScheduleInfo>({
    nextSchedule: null,
    lastRun: null,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [workspacesRes, collectionsRes, documentsRes, schedulesRes] = await Promise.all([
          workspacesApi.list(),
          collectionsApi.list(),
          documentsApi.list(),
          syncSchedulesApi.list({ enabled: true }),
        ]);

        setStats({
          workspaces: workspacesRes.data.count,
          collections: collectionsRes.data.count,
          documents: documentsRes.data.count,
        });

        // Find next scheduled sync and last run
        const schedules = schedulesRes.data.results;
        let nextSchedule: SyncSchedule | null = null;
        let lastRun: SyncScheduleInfo['lastRun'] = null;

        for (const schedule of schedules) {
          // Find closest next run
          if (schedule.next_run_at) {
            if (!nextSchedule || new Date(schedule.next_run_at) < new Date(nextSchedule.next_run_at!)) {
              nextSchedule = schedule;
            }
          }

          // Find most recent run across all schedules
          if (schedule.recent_runs && schedule.recent_runs.length > 0) {
            const mostRecentRun = schedule.recent_runs[0];
            if (mostRecentRun.completed_at) {
              if (!lastRun || new Date(mostRecentRun.completed_at) > new Date(lastRun.runAt)) {
                lastRun = {
                  schedule,
                  runAt: mostRecentRun.completed_at,
                  success: mostRecentRun.sync_history_success,
                };
              }
            }
          }
        }

        setScheduleInfo({ nextSchedule, lastRun });
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="p-6 md:p-8 lg:p-12 w-full">
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Welcome to Data Nexus Bridge</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6 mb-12">
        <Link
          to="/dashboard/workspaces"
          className="bg-white rounded-xl p-5 md:p-8 shadow-sm flex items-center gap-4 md:gap-6 hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
        >
          <div className="text-4xl md:text-5xl w-12 h-12 md:w-16 md:h-16 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex-shrink-0">
            📁
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Workspaces</h3>
            <p className="text-2xl md:text-3xl font-bold text-gray-900">
              {isLoading ? '...' : stats.workspaces}
            </p>
          </div>
        </Link>

        <Link
          to="/dashboard/collections"
          className="bg-white rounded-xl p-5 md:p-8 shadow-sm flex items-center gap-4 md:gap-6 hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
        >
          <div className="text-4xl md:text-5xl w-12 h-12 md:w-16 md:h-16 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex-shrink-0">
            📑
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Collections</h3>
            <p className="text-2xl md:text-3xl font-bold text-gray-900">
              {isLoading ? '...' : stats.collections}
            </p>
          </div>
        </Link>

        <Link
          to="/dashboard/documents"
          className="bg-white rounded-xl p-5 md:p-8 shadow-sm flex items-center gap-4 md:gap-6 hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
        >
          <div className="text-4xl md:text-5xl w-12 h-12 md:w-16 md:h-16 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex-shrink-0">
            📄
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Documents</h3>
            <p className="text-2xl md:text-3xl font-bold text-gray-900">
              {isLoading ? '...' : stats.documents}
            </p>
          </div>
        </Link>

        <Link
          to="/dashboard/sync-schedules"
          className="bg-white rounded-xl p-5 md:p-8 shadow-sm flex flex-col gap-2 hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="text-3xl w-12 h-12 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex-shrink-0">
              🔄
            </div>
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Sync Schedules</h3>
          </div>
          <div className="mt-2 space-y-2">
            {isLoading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : (
              <>
                {scheduleInfo.lastRun ? (
                  <div>
                    <p className="text-xs text-gray-500">Last run</p>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(scheduleInfo.lastRun.runAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      {scheduleInfo.lastRun.schedule.name}
                      {scheduleInfo.lastRun.success ? (
                        <span className="text-green-600 ml-1">✓</span>
                      ) : (
                        <span className="text-red-600 ml-1">✗</span>
                      )}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No runs yet</p>
                )}
                {scheduleInfo.nextSchedule && (
                  <div className="pt-1 border-t border-gray-100">
                    <p className="text-xs text-gray-500">Next scheduled</p>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(scheduleInfo.nextSchedule.next_run_at!).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">{scheduleInfo.nextSchedule.name}</p>
                  </div>
                )}
                {!scheduleInfo.lastRun && !scheduleInfo.nextSchedule && (
                  <p className="text-sm text-gray-500">No schedules configured</p>
                )}
              </>
            )}
          </div>
        </Link>
      </div>

      <div className="bg-white rounded-xl p-6 md:p-10 shadow-sm">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">Getting Started</h2>
        <p className="text-gray-600 mb-6 leading-relaxed">Use the sidebar navigation to access different sections:</p>
        <ul className="space-y-2 text-gray-700 leading-relaxed pl-6 list-disc">
          <li><strong className="text-gray-900">Workspaces</strong> - View and sync your Affinda workspaces</li>
          <li><strong className="text-gray-900">Collections</strong> - Browse document collections</li>
          <li><strong className="text-gray-900">Documents</strong> - View processed documents</li>
        </ul>
      </div>
    </div>
  );
}

export default DashboardPage;
