import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { workspacesApi, type Workspace } from '../api/client';
import './WorkspacesPage.css';

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

  if (isLoading) return <div className="loading">Loading workspaces...</div>;
  if (error) return <div className="error">Error loading workspaces: {String(error)}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Workspaces</h2>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="sync-button"
        >
          {syncMutation.isPending ? 'Syncing...' : 'Sync from Affinda'}
        </button>
      </div>

      {data?.results && data.results.length > 0 ? (
        <div className="card-grid">
          {data.results.map((workspace: Workspace) => (
            <div key={workspace.id} className="card">
              <h3>{workspace.name || workspace.identifier}</h3>
              <div className="card-details">
                <p>
                  <strong>Identifier:</strong> {workspace.identifier}
                </p>
                <p>
                  <strong>Organization:</strong> {workspace.organization_identifier}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No workspaces found. Click "Sync from Affinda" to import workspaces.</p>
        </div>
      )}

      {data && data.count > 0 && (
        <div className="pagination-info">
          Showing {data.results.length} of {data.count} workspaces
        </div>
      )}
    </div>
  );
}

export default WorkspacesPage;
