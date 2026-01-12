import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { workspacesApi, collectionsApi, documentsApi, syncHistoryApi, type LatestSyncs } from '../api/client';

interface DashboardStats {
  workspaces: number;
  collections: number;
  documents: number;
}

function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    workspaces: 0,
    collections: 0,
    documents: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [latestSyncs, setLatestSyncs] = useState<LatestSyncs>({});

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [workspacesRes, collectionsRes, documentsRes, syncsRes] = await Promise.all([
          workspacesApi.list(),
          collectionsApi.list(),
          documentsApi.list(),
          syncHistoryApi.latest(),
        ]);

        setStats({
          workspaces: workspacesRes.data.count,
          collections: collectionsRes.data.count,
          documents: documentsRes.data.count,
        });
        setLatestSyncs(syncsRes.data);
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="p-12 w-full">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Welcome to Data Nexus Bridge</p>
      </div>

      <div className="grid grid-cols-4 gap-6 mb-12">
        <Link
          to="/dashboard/workspaces"
          className="bg-white rounded-xl p-8 shadow-sm flex items-center gap-6 hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
        >
          <div className="text-5xl w-16 h-16 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex-shrink-0">
            📁
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Workspaces</h3>
            <p className="text-3xl font-bold text-gray-900">
              {isLoading ? '...' : stats.workspaces}
            </p>
          </div>
        </Link>

        <Link
          to="/dashboard/collections"
          className="bg-white rounded-xl p-8 shadow-sm flex items-center gap-6 hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
        >
          <div className="text-5xl w-16 h-16 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex-shrink-0">
            📑
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Collections</h3>
            <p className="text-3xl font-bold text-gray-900">
              {isLoading ? '...' : stats.collections}
            </p>
          </div>
        </Link>

        <Link
          to="/dashboard/documents"
          className="bg-white rounded-xl p-8 shadow-sm flex items-center gap-6 hover:-translate-y-0.5 hover:shadow-lg transition-all cursor-pointer"
        >
          <div className="text-5xl w-16 h-16 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex-shrink-0">
            📄
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Documents</h3>
            <p className="text-3xl font-bold text-gray-900">
              {isLoading ? '...' : stats.documents}
            </p>
          </div>
        </Link>

        <div className="bg-white rounded-xl p-8 shadow-sm flex flex-col gap-2 hover:-translate-y-0.5 hover:shadow-lg transition-all">
          <div className="flex items-center gap-3">
            <div className="text-3xl w-12 h-12 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex-shrink-0">
              🔄
            </div>
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Last Sync</h3>
          </div>
          <div className="mt-2">
            {isLoading ? (
              <p className="text-sm text-gray-500">Loading...</p>
            ) : latestSyncs.field_definitions?.completed_at ? (
              <>
                <p className="text-xs text-gray-500 mb-1">Field Definitions</p>
                <p className="text-sm font-medium text-gray-900">
                  {new Date(latestSyncs.field_definitions.completed_at).toLocaleString()}
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">No syncs yet</p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-10 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Getting Started</h2>
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
