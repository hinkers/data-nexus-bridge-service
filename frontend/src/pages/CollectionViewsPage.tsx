import { useEffect, useState } from 'react';
import {
  collectionsApi,
  collectionViewsApi,
  fieldDefinitionsApi,
  type Collection,
  type CollectionView,
  type CollectionViewPreview,
  type DocumentColumnOption,
  type ExternalTableSummary,
  type FieldDefinition,
} from '../api/client';

function CollectionViewsPage() {
  const [views, setViews] = useState<CollectionView[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    collection: 0,
    name: '',
    description: '',
  });
  const [isCreating, setIsCreating] = useState(false);

  // Preview modal state
  const [previewView, setPreviewView] = useState<CollectionView | null>(null);
  const [preview, setPreview] = useState<CollectionViewPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Fields modal state
  const [fieldsView, setFieldsView] = useState<CollectionView | null>(null);
  const [availableFields, setAvailableFields] = useState<FieldDefinition[]>([]);
  const [selectedFields, setSelectedFields] = useState<number[]>([]);
  const [isLoadingFields, setIsLoadingFields] = useState(false);

  // Document columns modal state
  const [columnsView, setColumnsView] = useState<CollectionView | null>(null);
  const [availableColumns, setAvailableColumns] = useState<DocumentColumnOption[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [isSavingColumns, setIsSavingColumns] = useState(false);

  // External tables modal state
  const [extTablesView, setExtTablesView] = useState<CollectionView | null>(null);
  const [availableExtTables, setAvailableExtTables] = useState<ExternalTableSummary[]>([]);
  const [selectedExtTables, setSelectedExtTables] = useState<number[]>([]);
  const [selectedExtTableColumns, setSelectedExtTableColumns] = useState<Record<string, number[]>>({});
  const [expandedExtTables, setExpandedExtTables] = useState<Set<number>>(new Set());
  const [isSavingExtTables, setIsSavingExtTables] = useState(false);

  // Action states
  const [actionLoading, setActionLoading] = useState<{ [key: number]: string }>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [viewsRes, collectionsRes] = await Promise.all([
        collectionViewsApi.list(),
        collectionsApi.list(),
      ]);
      setViews(viewsRes.data.results);
      setCollections(collectionsRes.data.results);
    } catch (err) {
      setError('Failed to load data');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.collection || !createForm.name) return;

    try {
      setIsCreating(true);
      await collectionViewsApi.create({
        collection: createForm.collection,
        name: createForm.name,
        description: createForm.description,
      });
      setShowCreateModal(false);
      setCreateForm({ collection: 0, name: '', description: '' });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create view');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (view: CollectionView) => {
    if (!confirm(`Are you sure you want to delete "${view.name}"? This will also drop the SQL view if active.`)) {
      return;
    }

    try {
      setActionLoading((prev) => ({ ...prev, [view.id]: 'delete' }));
      await collectionViewsApi.delete(view.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete view');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[view.id];
        return next;
      });
    }
  };

  const handleActivate = async (view: CollectionView) => {
    try {
      setActionLoading((prev) => ({ ...prev, [view.id]: 'activate' }));
      const res = await collectionViewsApi.activate(view.id);
      if (!res.data.success) {
        setError(res.data.message);
      }
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to activate view');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[view.id];
        return next;
      });
    }
  };

  const handleDeactivate = async (view: CollectionView) => {
    try {
      setActionLoading((prev) => ({ ...prev, [view.id]: 'deactivate' }));
      const res = await collectionViewsApi.deactivate(view.id);
      if (!res.data.success) {
        setError(res.data.message);
      }
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to deactivate view');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[view.id];
        return next;
      });
    }
  };

  const handleRefresh = async (view: CollectionView) => {
    try {
      setActionLoading((prev) => ({ ...prev, [view.id]: 'refresh' }));
      const res = await collectionViewsApi.refresh(view.id);
      if (!res.data.success) {
        setError(res.data.message);
      }
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to refresh view');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[view.id];
        return next;
      });
    }
  };

  const handleShowPreview = async (view: CollectionView) => {
    setPreviewView(view);
    setIsLoadingPreview(true);
    try {
      const res = await collectionViewsApi.preview(view.id);
      setPreview(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load preview');
      setPreviewView(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleShowFields = async (view: CollectionView) => {
    setFieldsView(view);
    setSelectedFields(view.include_fields || []);
    setIsLoadingFields(true);
    try {
      const res = await fieldDefinitionsApi.list(view.collection.toString());
      setAvailableFields(res.data.results);
    } catch (err: any) {
      setError('Failed to load fields');
      setFieldsView(null);
    } finally {
      setIsLoadingFields(false);
    }
  };

  const handleSaveFields = async () => {
    if (!fieldsView) return;

    try {
      setIsLoadingFields(true);
      await collectionViewsApi.update(fieldsView.id, {
        include_fields: selectedFields.length > 0 ? selectedFields : [],
      });
      setFieldsView(null);
      fetchData();
    } catch (err: any) {
      setError('Failed to update fields');
    } finally {
      setIsLoadingFields(false);
    }
  };

  const toggleField = (fieldId: number) => {
    setSelectedFields((prev) =>
      prev.includes(fieldId) ? prev.filter((id) => id !== fieldId) : [...prev, fieldId]
    );
  };

  const handleShowColumns = (view: CollectionView) => {
    setColumnsView(view);
    setAvailableColumns(view.available_document_columns || []);
    // If no columns selected, use defaults (empty array means defaults will be used)
    setSelectedColumns(view.include_document_columns || []);
  };

  const handleSaveColumns = async () => {
    if (!columnsView) return;

    try {
      setIsSavingColumns(true);
      await collectionViewsApi.update(columnsView.id, {
        include_document_columns: selectedColumns,
      });
      setColumnsView(null);
      fetchData();
    } catch (err: any) {
      setError('Failed to update columns');
    } finally {
      setIsSavingColumns(false);
    }
  };

  const toggleColumn = (columnName: string) => {
    setSelectedColumns((prev) =>
      prev.includes(columnName) ? prev.filter((c) => c !== columnName) : [...prev, columnName]
    );
  };

  const handleShowExtTables = (view: CollectionView) => {
    setExtTablesView(view);
    setAvailableExtTables(view.available_external_tables || []);
    setSelectedExtTables(view.include_external_tables || []);
    setSelectedExtTableColumns(view.include_external_table_columns || {});
    // Auto-expand tables that are selected
    setExpandedExtTables(new Set(view.include_external_tables || []));
  };

  const handleSaveExtTables = async () => {
    if (!extTablesView) return;

    try {
      setIsSavingExtTables(true);
      // Only include column selections for selected tables
      const filteredColumnSelections: Record<string, number[]> = {};
      for (const tableId of selectedExtTables) {
        const tableIdStr = tableId.toString();
        if (selectedExtTableColumns[tableIdStr]?.length > 0) {
          filteredColumnSelections[tableIdStr] = selectedExtTableColumns[tableIdStr];
        }
      }
      await collectionViewsApi.update(extTablesView.id, {
        include_external_tables: selectedExtTables,
        include_external_table_columns: filteredColumnSelections,
      });
      setExtTablesView(null);
      fetchData();
    } catch (err: any) {
      setError('Failed to update external tables');
    } finally {
      setIsSavingExtTables(false);
    }
  };

  const toggleExtTable = (tableId: number) => {
    setSelectedExtTables((prev) => {
      const isSelected = prev.includes(tableId);
      if (isSelected) {
        // When deselecting, also collapse the table
        setExpandedExtTables((exp) => {
          const next = new Set(exp);
          next.delete(tableId);
          return next;
        });
        return prev.filter((id) => id !== tableId);
      } else {
        // When selecting, also expand the table
        setExpandedExtTables((exp) => new Set(exp).add(tableId));
        return [...prev, tableId];
      }
    });
  };

  const toggleExtTableExpand = (tableId: number) => {
    setExpandedExtTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableId)) {
        next.delete(tableId);
      } else {
        next.add(tableId);
      }
      return next;
    });
  };

  const toggleExtTableColumn = (tableId: number, columnId: number) => {
    const tableIdStr = tableId.toString();
    setSelectedExtTableColumns((prev) => {
      const currentCols = prev[tableIdStr] || [];
      if (currentCols.includes(columnId)) {
        // Remove column
        const newCols = currentCols.filter((id) => id !== columnId);
        if (newCols.length === 0) {
          // Remove the key entirely if no columns selected (means all columns)
          const { [tableIdStr]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [tableIdStr]: newCols };
      } else {
        // Add column
        return { ...prev, [tableIdStr]: [...currentCols, columnId] };
      }
    });
  };

  const selectAllExtTableColumns = (tableId: number, allColumnIds: number[]) => {
    const tableIdStr = tableId.toString();
    setSelectedExtTableColumns((prev) => {
      const currentCols = prev[tableIdStr] || [];
      if (currentCols.length === allColumnIds.length) {
        // All selected, so clear to mean "all columns"
        const { [tableIdStr]: _, ...rest } = prev;
        return rest;
      } else {
        // Select all specific columns
        return { ...prev, [tableIdStr]: allColumnIds };
      }
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 lg:p-10 w-full max-w-7xl">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 lg:p-10 w-full max-w-7xl">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Collection Views</h1>
          <p className="text-gray-500 mt-1">Create and manage SQL database views for your collections</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          + Create View
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {views.length === 0 ? (
        <div className="bg-white rounded-xl p-12 shadow-sm text-center">
          <div className="text-6xl mb-4">📊</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Views Yet</h3>
          <p className="text-gray-600 mb-6">
            Create a view to generate SQL database views from your collection data.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            Create Your First View
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {views.map((view) => (
            <div key={view.id} className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{view.name}</h3>
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        view.is_active
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {view.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    Collection: <span className="font-medium">{view.collection_name}</span>
                  </p>
                  {view.description && (
                    <p className="text-sm text-gray-500 mb-3">{view.description}</p>
                  )}
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                    <span>
                      SQL View: <code className="bg-gray-100 px-2 py-0.5 rounded">{view.sql_view_name}</code>
                    </span>
                    <span>Fields: {view.fields_count}</span>
                    {view.last_refreshed_at && (
                      <span>
                        Last refreshed: {new Date(view.last_refreshed_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {view.error_message && (
                    <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">
                      {view.error_message}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleShowPreview(view)}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                    title="Preview SQL"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => handleShowColumns(view)}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                    title="Configure Document Columns"
                  >
                    Columns
                  </button>
                  <button
                    onClick={() => handleShowFields(view)}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                    title="Configure Fields"
                  >
                    Fields
                  </button>
                  <button
                    onClick={() => handleShowExtTables(view)}
                    className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                    title="Configure External Tables"
                  >
                    Ext Tables
                  </button>
                  {view.is_active ? (
                    <>
                      <button
                        onClick={() => handleRefresh(view)}
                        disabled={!!actionLoading[view.id]}
                        className="px-3 py-1.5 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition-colors disabled:opacity-50"
                        title="Refresh view with current schema"
                      >
                        {actionLoading[view.id] === 'refresh' ? 'Refreshing...' : 'Refresh'}
                      </button>
                      <button
                        onClick={() => handleDeactivate(view)}
                        disabled={!!actionLoading[view.id]}
                        className="px-3 py-1.5 text-sm bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors disabled:opacity-50"
                        title="Drop SQL view"
                      >
                        {actionLoading[view.id] === 'deactivate' ? 'Deactivating...' : 'Deactivate'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleActivate(view)}
                      disabled={!!actionLoading[view.id]}
                      className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors disabled:opacity-50"
                      title="Create SQL view in database"
                    >
                      {actionLoading[view.id] === 'activate' ? 'Activating...' : 'Activate'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(view)}
                    disabled={!!actionLoading[view.id]}
                    className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors disabled:opacity-50"
                    title="Delete view"
                  >
                    {actionLoading[view.id] === 'delete' ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold mb-4">Create Collection View</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Collection</label>
                <select
                  value={createForm.collection}
                  onChange={(e) => setCreateForm({ ...createForm, collection: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                >
                  <option value={0}>Select a collection...</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.identifier}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">View Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="e.g., Invoice Summary"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Describe what this view is for..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!createForm.collection || !createForm.name || isCreating}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create View'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewView && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">SQL Preview: {previewView.name}</h2>
              <button
                onClick={() => {
                  setPreviewView(null);
                  setPreview(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>
            {isLoadingPreview ? (
              <div className="animate-pulse p-4">Loading preview...</div>
            ) : preview ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Database Engine: <span className="font-mono">{preview.db_engine}</span>
                  </h3>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Document Columns ({preview.document_columns.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {preview.document_columns.map((col) => (
                      <span
                        key={col}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm font-mono"
                      >
                        {col}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Field Columns ({preview.fields.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {preview.fields.map((field) => (
                      <span
                        key={field.id}
                        className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-sm font-mono"
                        title={`Column: ${field.column_name}`}
                      >
                        {field.name || field.slug}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">CREATE VIEW SQL</h3>
                  <pre className="bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto text-sm">
                    {preview.create_sql}
                  </pre>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">DROP VIEW SQL</h3>
                  <pre className="bg-gray-900 text-red-400 p-4 rounded-lg overflow-x-auto text-sm">
                    {preview.drop_sql}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Fields Modal */}
      {fieldsView && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Configure Fields: {fieldsView.name}</h2>
              <button
                onClick={() => setFieldsView(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>
            {isLoadingFields ? (
              <div className="animate-pulse p-4">Loading fields...</div>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  Select which fields to include in this view. Leave all unchecked to include all fields.
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {availableFields.map((field) => (
                    <label
                      key={field.id}
                      className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(field.id)}
                        onChange={() => toggleField(field.id)}
                        className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                      />
                      <div>
                        <div className="font-medium text-gray-900">{field.name || field.slug}</div>
                        <div className="text-xs text-gray-500">{field.data_type}</div>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex justify-between items-center mt-6">
                  <span className="text-sm text-gray-500">
                    {selectedFields.length === 0
                      ? 'All fields will be included'
                      : `${selectedFields.length} field(s) selected`}
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setFieldsView(null)}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveFields}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Document Columns Modal */}
      {columnsView && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Document Columns: {columnsView.name}</h2>
              <button
                onClick={() => setColumnsView(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Select which document columns to include in this view. Leave all unchecked to use defaults
              (identifier, custom_identifier, file_name, review_url, state, created_dt).
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {availableColumns.map((column) => (
                <label
                  key={column.name}
                  className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(column.name)}
                    onChange={() => toggleColumn(column.name)}
                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">{column.label}</div>
                    <div className="text-xs text-gray-500 font-mono">{column.name}</div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-between items-center mt-6">
              <span className="text-sm text-gray-500">
                {selectedColumns.length === 0
                  ? 'Default columns will be used'
                  : `${selectedColumns.length} column(s) selected`}
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setColumnsView(null)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveColumns}
                  disabled={isSavingColumns}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {isSavingColumns ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* External Tables Modal */}
      {extTablesView && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">External Tables: {extTablesView.name}</h2>
              <button
                onClick={() => setExtTablesView(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Select which external tables and columns to join to this view. Expand a table to select specific columns (leave unchecked for all columns).
            </p>
            {availableExtTables.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-2">No external tables available for this collection.</p>
                <a
                  href="/dashboard/external-tables"
                  className="text-purple-600 hover:text-purple-700 text-sm"
                >
                  Create an external table
                </a>
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {availableExtTables.map((table) => {
                  const isSelected = selectedExtTables.includes(table.id);
                  const isExpanded = expandedExtTables.has(table.id);
                  const tableIdStr = table.id.toString();
                  const selectedCols = selectedExtTableColumns[tableIdStr] || [];
                  const allColumnIds = table.columns.map((c) => c.id);

                  return (
                    <div
                      key={table.id}
                      className={`border rounded-lg ${
                        isSelected ? 'border-purple-300 bg-purple-50/50' : 'border-gray-200'
                      } ${!table.is_active ? 'opacity-50' : ''}`}
                    >
                      {/* Table header row */}
                      <div className="flex items-center gap-3 p-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => table.is_active && toggleExtTable(table.id)}
                          disabled={!table.is_active}
                          className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                        />
                        <button
                          onClick={() => table.is_active && toggleExtTableExpand(table.id)}
                          disabled={!table.is_active}
                          className="text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed"
                        >
                          <svg
                            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">{table.name}</span>
                            <span
                              className={`px-1.5 py-0.5 text-xs rounded ${
                                table.is_active
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {table.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            <span className="font-mono">{table.sql_table_name}</span>
                            <span className="mx-1">·</span>
                            {isSelected ? (
                              <span>
                                {selectedCols.length === 0
                                  ? `All ${table.column_count} columns`
                                  : `${selectedCols.length} of ${table.column_count} columns`}
                              </span>
                            ) : (
                              <span>{table.column_count} column(s)</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded columns section */}
                      {isExpanded && table.columns.length > 0 && (
                        <div className="border-t border-gray-200 bg-white rounded-b-lg">
                          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-600">Columns</span>
                            <button
                              onClick={() => selectAllExtTableColumns(table.id, allColumnIds)}
                              className="text-xs text-purple-600 hover:text-purple-700"
                            >
                              {selectedCols.length === allColumnIds.length ? 'Clear selection' : 'Select all'}
                            </button>
                          </div>
                          <div className="p-2 grid grid-cols-2 gap-1">
                            {table.columns.map((column) => (
                              <label
                                key={column.id}
                                className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedCols.length === 0 || selectedCols.includes(column.id)}
                                  onChange={() => toggleExtTableColumn(table.id, column.id)}
                                  className="w-3.5 h-3.5 text-purple-600 rounded focus:ring-purple-500"
                                />
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-800 truncate">{column.name}</div>
                                  <div className="text-xs text-gray-500 truncate">
                                    <span className="font-mono">{column.sql_column_name}</span>
                                    <span className="mx-1">·</span>
                                    <span>{column.data_type}</span>
                                  </div>
                                </div>
                              </label>
                            ))}
                          </div>
                          {selectedCols.length === 0 && (
                            <div className="px-3 py-2 bg-blue-50 border-t border-blue-100 text-xs text-blue-700">
                              All columns will be included. Select specific columns to limit the view.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="flex justify-between items-center mt-6">
              <span className="text-sm text-gray-500">
                {selectedExtTables.length === 0
                  ? 'No external tables selected'
                  : `${selectedExtTables.length} table(s) selected`}
              </span>
              <div className="flex gap-3">
                <button
                  onClick={() => setExtTablesView(null)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveExtTables}
                  disabled={isSavingExtTables}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                  {isSavingExtTables ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CollectionViewsPage;
