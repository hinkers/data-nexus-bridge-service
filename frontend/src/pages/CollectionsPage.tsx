import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { collectionsApi, workspacesApi, type Collection } from '../api/client';

function CollectionsPage() {
  const [searchParams] = useSearchParams();
  const workspaceIdFromUrl = searchParams.get('workspace');

  const { data, isLoading, error } = useQuery({
    queryKey: ['collections', workspaceIdFromUrl],
    queryFn: async () => {
      const response = await collectionsApi.list(
        workspaceIdFromUrl ? { workspace: workspaceIdFromUrl } : undefined
      );
      return response.data;
    },
  });

  const { data: workspaceData } = useQuery({
    queryKey: ['workspace', workspaceIdFromUrl],
    queryFn: async () => {
      if (!workspaceIdFromUrl) return null;
      const response = await workspacesApi.get(workspaceIdFromUrl);
      return response.data;
    },
    enabled: !!workspaceIdFromUrl,
  });

  if (isLoading) return (
    <div className="p-12 w-full">
      <div className="text-center text-gray-500">Loading collections...</div>
    </div>
  );

  if (error) return (
    <div className="p-12 w-full">
      <div className="text-center text-red-600">Error loading collections: {String(error)}</div>
    </div>
  );

  return (
    <div className="p-12 w-full">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Collections</h1>
        <p className="text-gray-600">View and manage document collections</p>
        {workspaceData && (
          <div className="mt-4 inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-lg">
            <span className="text-sm font-medium">Filtered by workspace: {workspaceData.name}</span>
            <button
              onClick={() => {
                window.history.pushState({}, '', '/dashboard/collections');
                window.location.reload();
              }}
              className="text-purple-900 hover:text-purple-950 font-bold"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {data?.results && data.results.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.results.map((collection: Collection) => (
            <div key={collection.id} className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                {collection.name || collection.identifier}
              </h3>
              <div className="space-y-2 mb-4">
                <div className="text-sm">
                  <span className="font-medium text-gray-600">Identifier:</span>
                  <p className="text-gray-900 font-mono text-xs mt-1">{collection.identifier}</p>
                </div>
                <div className="text-sm">
                  <span className="font-medium text-gray-600">Workspace:</span>
                  <p className="text-gray-900">{collection.workspace_name}</p>
                </div>
              </div>
              <Link
                to={`/dashboard/documents?collection=${collection.id}`}
                className="block text-center bg-gradient-to-r from-purple-600 to-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition"
              >
                View Documents
              </Link>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <p className="text-gray-500">No collections found. Sync workspaces first to import collections.</p>
        </div>
      )}

      {data && data.count > 0 && (
        <div className="mt-6 text-center text-sm text-gray-500">
          Showing {data.results.length} of {data.count} collections
        </div>
      )}
    </div>
  );
}

export default CollectionsPage;
