import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { workspacesApi, type Workspace } from '../api/client';

function WorkspacesPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const response = await workspacesApi.list();
      return response.data;
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => workspacesApi.sync(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      alert('Sync completed successfully!');
    },
    onError: (error: any) => {
      alert(`Sync failed: ${error.response?.data?.detail || error.message}`);
    },
  });

  if (isLoading) return (
    <div className="p-6 md:p-8 lg:p-10 w-full max-w-7xl">
      <div className="text-center text-gray-500">Loading workspaces...</div>
    </div>
  );

  if (error) return (
    <div className="p-6 md:p-8 lg:p-10 w-full max-w-7xl">
      <div className="text-center text-red-600">Error loading workspaces: {String(error)}</div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 lg:p-10 w-full max-w-7xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Workspaces</h1>
          <p className="text-gray-500 mt-1">View and manage Affinda workspaces</p>
        </div>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {syncMutation.isPending ? 'Syncing...' : 'Sync from Affinda'}
        </button>
      </div>

      {data?.results && data.results.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.results.map((workspace: Workspace) => (
            <div key={workspace.id} className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                {workspace.name || workspace.identifier}
              </h3>
              <div className="space-y-2 mb-4">
                <div className="text-sm">
                  <span className="font-medium text-gray-600">Identifier:</span>
                  <p className="text-gray-900 font-mono text-xs mt-1">{workspace.identifier}</p>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-gray-600">Organization:</span>
                  <p className="text-gray-900">{workspace.organization_identifier}</p>
                </div>
              </div>
              <Link
                to={`/dashboard/collections?workspace=${workspace.id}`}
                className="block text-center bg-gradient-to-r from-purple-600 to-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition"
              >
                View Document Types
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <p className="text-gray-500">No workspaces found. Click "Sync from Affinda" to import workspaces.</p>
        </div>
      )}

      {data && data.count > 0 && (
        <div className="mt-6 text-center text-sm text-gray-500">
          Showing {data.results.length} of {data.count} workspaces
        </div>
      )}
    </div>
  );
}

export default WorkspacesPage;
