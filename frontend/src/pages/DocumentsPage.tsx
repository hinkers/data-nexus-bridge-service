import { useQuery } from '@tanstack/react-query';
import { documentsApi, type Document } from '../api/client';
import './WorkspacesPage.css';

function DocumentsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['documents'],
    queryFn: async () => {
      const response = await documentsApi.list();
      return response.data;
    },
  });

  if (isLoading) return <div className="loading">Loading documents...</div>;
  if (error) return <div className="error">Error loading documents: {String(error)}</div>;

  const getStateClass = (state: string) => {
    switch (state) {
      case 'complete':
        return 'state-complete';
      case 'review':
        return 'state-review';
      case 'archived':
        return 'state-archived';
      default:
        return '';
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <h2>Documents</h2>
      </div>

      {data?.results && data.results.length > 0 ? (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>File Name</th>
                <th>Workspace</th>
                <th>Collection</th>
                <th>State</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((document: Document) => (
                <tr key={document.id}>
                  <td>{document.file_name || document.custom_identifier || document.identifier}</td>
                  <td>{document.workspace_name || '-'}</td>
                  <td>{document.collection_name || '-'}</td>
                  <td>
                    <span className={`state-badge ${getStateClass(document.state)}`}>
                      {document.state || 'unknown'}
                    </span>
                  </td>
                  <td>
                    <div className="status-indicators">
                      {document.ready && <span className="status-badge status-ready">Ready</span>}
                      {document.in_review && <span className="status-badge status-review">In Review</span>}
                      {document.failed && <span className="status-badge status-failed">Failed</span>}
                    </div>
                  </td>
                  <td>{new Date(document.created_dt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <p>No documents found.</p>
        </div>
      )}

      {data && data.count > 0 && (
        <div className="pagination-info">
          Showing {data.results.length} of {data.count} documents
        </div>
      )}
    </div>
  );
}

export default DocumentsPage;
