import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { collectionsApi, workspacesApi, type Collection, type CollectionSyncStatus } from '../api/client';

function CollectionsPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  useEffect(() => {
    document.title = 'Document Types - DNBS';
  }, []);

  // Sync state
  const [syncingCollection, setSyncingCollection] = useState<string | null>(null);
  const [showSyncConfirm, setShowSyncConfirm] = useState<Collection | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [syncStatuses, setSyncStatuses] = useState<Record<string, CollectionSyncStatus>>({});
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

  // Full sync mutation
  const fullSyncMutation = useMutation({
    mutationFn: async (identifier: string) => {
      const response = await collectionsApi.fullSync(identifier);
      return { identifier, data: response.data };
    },
    onSuccess: ({ identifier, data }) => {
      setSyncingCollection(identifier);
      // Start polling for status
      pollSyncStatus(identifier, data.sync_id);
    },
    onError: (error: any) => {
      setSyncMessage({
        type: 'error',
        text: error.response?.data?.message || error.message || 'Failed to start sync',
      });
      setSyncingCollection(null);
    },
  });

  // Poll sync status
  const pollSyncStatus = async (identifier: string, _syncId: number) => {
    const poll = async () => {
      try {
        const response = await collectionsApi.getSyncStatus(identifier);
        const status = response.data;
        setSyncStatuses(prev => ({ ...prev, [identifier]: status }));

        if (status.status === 'in_progress' || status.status === 'pending') {
          // Continue polling
          setTimeout(poll, 2000);
        } else {
          // Sync completed
          setSyncingCollection(null);
          if (status.status === 'completed') {
            setSyncMessage({
              type: 'success',
              text: `Sync completed! ${status.documents_created || 0} created, ${status.documents_updated || 0} updated`,
            });
          } else if (status.status === 'failed') {
            setSyncMessage({
              type: 'error',
              text: status.error_message || 'Sync failed',
            });
          }
          // Refresh collections data
          queryClient.invalidateQueries({ queryKey: ['collections'] });
        }
      } catch (error) {
        console.error('Failed to poll sync status:', error);
        setSyncingCollection(null);
      }
    };
    poll();
  };

  const handleStartSync = (collection: Collection) => {
    setShowSyncConfirm(collection);
  };

  const confirmSync = () => {
    if (showSyncConfirm) {
      setSyncMessage(null);
      fullSyncMutation.mutate(showSyncConfirm.identifier);
      setShowSyncConfirm(null);
    }
  };

  if (isLoading) return (
    <div className="p-6 md:p-8 lg:p-10 w-full max-w-7xl">
      <div className="text-center text-gray-500">Loading document types...</div>
    </div>
  );

  if (error) return (
    <div className="p-6 md:p-8 lg:p-10 w-full max-w-7xl">
      <div className="text-center text-red-600">Error loading document types: {String(error)}</div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 lg:p-10 w-full max-w-7xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Document Types</h1>
        <p className="text-gray-500 mt-1">View and manage Affinda document types</p>
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

        {/* Sync Message */}
        {syncMessage && (
          <div className={`mt-4 p-4 rounded-lg ${
            syncMessage.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            <div className="flex items-center justify-between">
              <span>{syncMessage.text}</span>
              <button
                onClick={() => setSyncMessage(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {data?.results && data.results.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {data.results.map((collection: Collection) => {
            const isSyncing = syncingCollection === collection.identifier;
            const syncStatus = syncStatuses[collection.identifier];

            return (
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

                {/* Sync Progress */}
                {isSyncing && syncStatus && (
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-700">Syncing...</span>
                      <span className="text-xs text-blue-600">
                        {syncStatus.progress_percent !== undefined
                          ? `${syncStatus.progress_percent}%`
                          : 'In progress'}
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${syncStatus.progress_percent || 0}%` }}
                      />
                    </div>
                    {syncStatus.total_documents !== undefined && (
                      <div className="text-xs text-blue-600 mt-1">
                        {syncStatus.documents_updated || 0} / {syncStatus.total_documents} documents
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Link
                    to={`/dashboard/documents?collection=${collection.id}`}
                    className="block text-center bg-gradient-to-r from-purple-600 to-blue-600 text-white py-2 px-4 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition"
                  >
                    View Documents
                  </Link>
                  <button
                    onClick={() => handleStartSync(collection)}
                    disabled={isSyncing || syncingCollection !== null}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white py-2 px-4 rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {isSyncing ? 'Syncing...' : 'Full Sync'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <p className="text-gray-500">No document types found. Sync workspaces first to import document types.</p>
        </div>
      )}

      {data && data.count > 0 && (
        <div className="mt-6 text-center text-sm text-gray-500">
          Showing {data.results.length} of {data.count} document types
        </div>
      )}

      {/* Sync Confirmation Modal */}
      {showSyncConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">Confirm Full Sync</h3>
            <div className="space-y-4">
              <p className="text-gray-600">
                You are about to sync all documents for this document type:
              </p>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="font-semibold text-gray-900">{showSyncConfirm.name || showSyncConfirm.identifier}</p>
                <p className="text-sm text-gray-500 font-mono">{showSyncConfirm.identifier}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="text-sm text-blue-800">
                    <p className="font-medium">How sync works</p>
                    <p className="mt-1">This will first try to fetch documents assigned to this document type. If none are found, it will fetch all documents from the workspace instead.</p>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Warning</p>
                    <p className="mt-1">For large workspaces, this may take several minutes and use significant API quota.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSyncConfirm(null)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirmSync}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
              >
                Start Sync
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CollectionsPage;
