import { useQuery } from '@tanstack/react-query';
import { collectionsApi, type Collection } from '../api/client';
import './WorkspacesPage.css';

function CollectionsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => {
      const response = await collectionsApi.list();
      return response.data;
    },
  });

  if (isLoading) return <div className="loading">Loading collections...</div>;
  if (error) return <div className="error">Error loading collections: {String(error)}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Collections</h2>
      </div>

      {data?.results && data.results.length > 0 ? (
        <div className="card-grid">
          {data.results.map((collection: Collection) => (
            <div key={collection.id} className="card">
              <h3>{collection.name || collection.identifier}</h3>
              <div className="card-details">
                <p>
                  <strong>Identifier:</strong> {collection.identifier}
                </p>
                <p>
                  <strong>Workspace:</strong> {collection.workspace_name}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No collections found. Sync workspaces first to import collections.</p>
        </div>
      )}

      {data && data.count > 0 && (
        <div className="pagination-info">
          Showing {data.results.length} of {data.count} collections
        </div>
      )}
    </div>
  );
}

export default CollectionsPage;
