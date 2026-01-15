import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { documentsApi, collectionsApi, fieldDefinitionsApi } from '../api/client';
import type { Document, Collection, FieldDefinition } from '../api/client';

function DocumentsPage() {
  const [searchParams] = useSearchParams();
  const collectionIdFromUrl = searchParams.get('collection');

  const [documents, setDocuments] = useState<Document[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCollection, setSelectedCollection] = useState<string>(collectionIdFromUrl || '');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);
  const pageSize = 100; // Matches backend PAGE_SIZE

  useEffect(() => {
    // Update selected collection when URL parameter changes
    if (collectionIdFromUrl) {
      setSelectedCollection(collectionIdFromUrl);
    }
  }, [collectionIdFromUrl]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCollection]);

  useEffect(() => {
    fetchData();
  }, [selectedCollection, currentPage]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const params: { collection?: string; page?: number } = { page: currentPage };
      if (selectedCollection) {
        params.collection = String(selectedCollection);
      }

      const [docsRes, collectionsRes] = await Promise.all([
        documentsApi.list(params),
        collectionsApi.list(),
      ]);

      setDocuments(docsRes.data.results);
      setTotalCount(docsRes.data.count);
      setHasNextPage(!!docsRes.data.next);
      setHasPrevPage(!!docsRes.data.previous);
      setCollections(collectionsRes.data.results);

      // Fetch field definitions for all collections
      const allFieldDefs = await Promise.all(
        collectionsRes.data.results.map(col =>
          fieldDefinitionsApi.list(String(col.id))
        )
      );

      const flatFieldDefs = allFieldDefs.flatMap(res => res.data.results);
      setFieldDefinitions(flatFieldDefs);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusBadge = (doc: Document) => {
    if (doc.failed) {
      return <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold">Failed</span>;
    }
    if (doc.in_review) {
      return <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">In Review</span>;
    }
    if (doc.state === 'complete') {
      return <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">Complete</span>;
    }
    if (doc.state === 'archived') {
      return <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">Archived</span>;
    }
    return <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">{doc.state}</span>;
  };

  const getFieldDefinitionsForDocument = (doc: Document) => {
    // Match by collection ID instead of name to be more reliable
    console.log('Getting field defs for document:', {
      docId: doc.id,
      docCollection: doc.collection,
      docCollectionType: typeof doc.collection,
      allFieldDefs: fieldDefinitions,
      filtered: fieldDefinitions.filter(fd => {
        console.log('Comparing:', { fdCollection: fd.collection, fdCollectionType: typeof fd.collection, docCollection: doc.collection });
        return fd.collection === doc.collection;
      })
    });
    return fieldDefinitions.filter(fd => fd.collection === doc.collection);
  };

  const handleRefreshDocument = async () => {
    if (!selectedDocument) return;

    setIsRefreshing(true);
    setRefreshMessage(null);

    try {
      const response = await documentsApi.refresh(selectedDocument.id);
      if (response.data.success && response.data.document) {
        // Update the selected document with refreshed data
        setSelectedDocument(response.data.document);
        // Also update in the documents list
        setDocuments(docs =>
          docs.map(d => d.id === selectedDocument.id ? response.data.document! : d)
        );
        setRefreshMessage({ type: 'success', text: response.data.message });
      } else {
        setRefreshMessage({ type: 'error', text: response.data.message || 'Failed to refresh document' });
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to refresh document';
      setRefreshMessage({ type: 'error', text: errorMessage });
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredDocuments = documents
    .filter(doc => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        doc.file_name.toLowerCase().includes(query) ||
        doc.custom_identifier.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      // Sort by created_dt, newest first
      const dateA = new Date(a.created_dt).getTime();
      const dateB = new Date(b.created_dt).getTime();
      return dateB - dateA;
    });

  const selectedCollectionName = collections.find(c => c.id === Number(selectedCollection))?.name;

  return (
    <div className="p-12 w-full">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Documents</h1>
        <p className="text-gray-600">View and manage processed documents</p>
        {selectedCollectionName && (
          <div className="mt-4 inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-lg">
            <span className="text-sm font-medium">Filtered by collection: {selectedCollectionName}</span>
            <button
              onClick={() => {
                setSelectedCollection('');
                window.history.pushState({}, '', '/dashboard/documents');
              }}
              className="text-purple-900 hover:text-purple-950 font-bold"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Documents List */}
        <div className="space-y-4">
          {/* Filter Section */}
          <div className="mb-4 flex gap-4 items-center">
            <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Filter by Collection:</label>
            <select
              value={selectedCollection}
              onChange={(e) => setSelectedCollection(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            >
              <option value="">All Collections</option>
              {collections.map(col => (
                <option key={col.id} value={col.id}>{col.name}</option>
              ))}
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by file name or identifier..."
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xl font-bold text-gray-900">Document List</h2>
            <span className="text-sm text-gray-500">
              {isLoading ? 'Loading...' : (
                totalCount === 0
                  ? '0 documents'
                  : searchQuery
                    ? `${filteredDocuments.length} matching (page ${currentPage}, ${totalCount} total)`
                    : `Showing ${((currentPage - 1) * pageSize) + 1}-${Math.min(currentPage * pageSize, totalCount)} of ${totalCount} document${totalCount !== 1 ? 's' : ''}`
              )}
            </span>
          </div>
          {isLoading ? (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center text-gray-500">
              Loading documents...
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center text-gray-500">
              {searchQuery ? 'No documents match your search' : 'No documents found'}
            </div>
          ) : (
            filteredDocuments.map(doc => (
              <div
                key={doc.id}
                onClick={() => setSelectedDocument(doc)}
                className={`bg-white rounded-xl p-6 shadow-sm cursor-pointer transition-all hover:shadow-md ${
                  selectedDocument?.id === doc.id ? 'ring-2 ring-purple-500' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{doc.file_name}</h3>
                    <p className="text-sm text-gray-500">{doc.custom_identifier}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {getStatusBadge(doc)}
                    <div className="text-xs text-gray-500">
                      {new Date(doc.created_dt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>
                    <span className="font-medium">Workspace:</span> {doc.workspace_name}
                  </div>
                  <div>
                    <span className="font-medium">Collection:</span> {doc.collection_name}
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Pagination Controls */}
          {!isLoading && totalCount > 0 && (
            <div className="flex items-center justify-between bg-white rounded-xl p-4 shadow-sm">
              <div className="text-sm text-gray-600">
                Page {currentPage} of {Math.ceil(totalCount / pageSize)}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={!hasPrevPage}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={!hasPrevPage}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => p + 1)}
                  disabled={!hasNextPage}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(Math.ceil(totalCount / pageSize))}
                  disabled={!hasNextPage}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Last
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Document Details */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Document Details</h2>
          {!selectedDocument ? (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center text-gray-500">
              Select a document to view details
            </div>
          ) : (
            <div className="bg-white rounded-xl p-6 shadow-sm space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 text-lg border-b pb-2">Basic Information</h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-gray-600">File Name:</span>
                    <p className="text-gray-900">{selectedDocument.file_name}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Custom Identifier:</span>
                    <p className="text-gray-900 font-mono text-sm">{selectedDocument.custom_identifier}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Document Identifier:</span>
                    <p className="text-gray-900 font-mono text-sm text-gray-500">{selectedDocument.identifier}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Workspace:</span>
                    <p className="text-gray-900">{selectedDocument.workspace_name}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Collection:</span>
                    <p className="text-gray-900">{selectedDocument.collection_name}</p>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Status:</span>
                    <div className="mt-1">{getStatusBadge(selectedDocument)}</div>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-600">Created:</span>
                    <p className="text-gray-900">{new Date(selectedDocument.created_dt).toLocaleString()}</p>
                  </div>
                  {selectedDocument.last_updated_dt && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Last Updated:</span>
                      <p className="text-gray-900">{new Date(selectedDocument.last_updated_dt).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Extracted Data */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 text-lg border-b pb-2">Extracted Data</h3>
                {getFieldDefinitionsForDocument(selectedDocument).length === 0 ? (
                  <p className="text-sm text-gray-500">No field definitions found for this collection</p>
                ) : (
                  <div className="space-y-3">
                    {getFieldDefinitionsForDocument(selectedDocument).map(field => {
                      const fieldValue = selectedDocument.data?.[field.slug];
                      return (
                        <div key={field.id} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <span className="font-medium text-gray-900">{field.name}</span>
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                              {field.data_type}
                            </span>
                          </div>
                          <div className="bg-white rounded p-2 border border-gray-200">
                            <p className="text-sm font-mono text-gray-900">
                              {fieldValue !== undefined && fieldValue !== null
                                ? String(fieldValue)
                                : <span className="text-gray-400 italic">No value extracted</span>
                              }
                            </p>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">Field: {field.slug}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Raw Data */}
              {selectedDocument.raw && Object.keys(selectedDocument.raw).length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-3 text-lg border-b pb-2">Raw Data</h3>
                  <pre className="bg-gray-50 rounded-lg p-4 text-xs overflow-auto max-h-64">
                    {JSON.stringify(selectedDocument.raw, null, 2)}
                  </pre>
                </div>
              )}

              {/* Refresh Message */}
              {refreshMessage && (
                <div className={`p-4 rounded-lg ${
                  refreshMessage.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {refreshMessage.text}
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleRefreshDocument}
                  disabled={isRefreshing}
                  className="block text-center bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isRefreshing ? 'Refreshing...' : 'Refresh from Affinda'}
                </button>
                <a
                  href={`https://app.affinda.com/document/${selectedDocument.identifier}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition"
                >
                  Open in Affinda
                </a>
                {selectedDocument.file_url && (
                  <a
                    href={selectedDocument.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center bg-gradient-to-r from-gray-600 to-gray-700 text-white py-3 rounded-lg font-semibold hover:from-gray-700 hover:to-gray-800 transition col-span-2"
                  >
                    View Original File
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DocumentsPage;
