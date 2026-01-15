import { useEffect, useState } from 'react';
import {
  collectionsApi,
  externalTablesApi,
  externalTableColumnsApi,
  type Collection,
  type ExternalTable,
  type ExternalTableColumn,
  type ExternalTablePreview,
  type ExternalTableTypeOption,
} from '../api/client';

function ExternalTablesPage() {
  const [tables, setTables] = useState<ExternalTable[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [newTableDescription, setNewTableDescription] = useState('');
  const [newTableCollection, setNewTableCollection] = useState<number | null>(null);
  const [newColumns, setNewColumns] = useState<Array<{
    name: string;
    data_type: string;
    is_nullable: boolean;
  }>>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [availableTypes, setAvailableTypes] = useState<ExternalTableTypeOption[]>([
    { value: 'text', label: 'Text' },
    { value: 'integer', label: 'Integer' },
    { value: 'decimal', label: 'Decimal' },
    { value: 'boolean', label: 'Boolean' },
    { value: 'date', label: 'Date' },
    { value: 'datetime', label: 'DateTime' },
  ]);

  // Preview modal state
  const [previewTable, setPreviewTable] = useState<ExternalTable | null>(null);
  const [preview, setPreview] = useState<ExternalTablePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  // Add column modal state
  const [addColumnTable, setAddColumnTable] = useState<ExternalTable | null>(null);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnType, setNewColumnType] = useState('text');
  const [newColumnNullable, setNewColumnNullable] = useState(true);
  const [isAddingColumn, setIsAddingColumn] = useState(false);

  // Action states
  const [actionLoading, setActionLoading] = useState<{ [key: number]: string }>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const [tablesRes, collectionsRes] = await Promise.all([
        externalTablesApi.list(),
        collectionsApi.list(),
      ]);
      setTables(tablesRes.data.results);
      setCollections(collectionsRes.data.results);

      // Get available types from first table if available
      if (tablesRes.data.results.length > 0 && tablesRes.data.results[0].available_types) {
        setAvailableTypes(tablesRes.data.results[0].available_types);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newTableName || !newTableCollection) return;

    try {
      setIsCreating(true);
      await externalTablesApi.create({
        collection: newTableCollection,
        name: newTableName,
        description: newTableDescription,
        columns: newColumns.map((col, idx) => ({
          ...col,
          display_order: idx,
        })),
      });
      setShowCreateModal(false);
      setNewTableName('');
      setNewTableDescription('');
      setNewTableCollection(null);
      setNewColumns([]);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create table');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (table: ExternalTable) => {
    if (!confirm(`Delete external table "${table.name}"? This will also drop the database table if active.`)) {
      return;
    }

    try {
      setActionLoading((prev) => ({ ...prev, [table.id]: 'delete' }));
      await externalTablesApi.delete(table.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete table');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[table.id];
        return next;
      });
    }
  };

  const handleActivate = async (table: ExternalTable) => {
    try {
      setActionLoading((prev) => ({ ...prev, [table.id]: 'activate' }));
      await externalTablesApi.activate(table.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to activate table');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[table.id];
        return next;
      });
    }
  };

  const handleDeactivate = async (table: ExternalTable) => {
    try {
      setActionLoading((prev) => ({ ...prev, [table.id]: 'deactivate' }));
      await externalTablesApi.deactivate(table.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to deactivate table');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[table.id];
        return next;
      });
    }
  };

  const handleRebuild = async (table: ExternalTable) => {
    if (!confirm(`Rebuild table "${table.name}"? This will drop and recreate the table, losing all data.`)) {
      return;
    }

    try {
      setActionLoading((prev) => ({ ...prev, [table.id]: 'rebuild' }));
      await externalTablesApi.rebuild(table.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to rebuild table');
    } finally {
      setActionLoading((prev) => {
        const next = { ...prev };
        delete next[table.id];
        return next;
      });
    }
  };

  const handleShowPreview = async (table: ExternalTable) => {
    setPreviewTable(table);
    setPreview(null);
    setIsLoadingPreview(true);

    try {
      const res = await externalTablesApi.preview(table.id);
      setPreview(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load preview');
      setPreviewTable(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleShowAddColumn = (table: ExternalTable) => {
    setAddColumnTable(table);
    setNewColumnName('');
    setNewColumnType('text');
    setNewColumnNullable(true);
  };

  const handleAddColumn = async () => {
    if (!addColumnTable || !newColumnName) return;

    try {
      setIsAddingColumn(true);
      await externalTableColumnsApi.create({
        external_table: addColumnTable.id,
        name: newColumnName,
        data_type: newColumnType,
        is_nullable: newColumnNullable,
      });
      setAddColumnTable(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add column');
    } finally {
      setIsAddingColumn(false);
    }
  };

  const handleDeleteColumn = async (column: ExternalTableColumn) => {
    if (!confirm(`Delete column "${column.name}"?`)) return;

    try {
      await externalTableColumnsApi.delete(column.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete column. Table must be deactivated first.');
    }
  };

  const addNewColumn = () => {
    setNewColumns([...newColumns, { name: '', data_type: 'text', is_nullable: true }]);
  };

  const removeNewColumn = (index: number) => {
    setNewColumns(newColumns.filter((_, i) => i !== index));
  };

  const updateNewColumn = (index: number, field: string, value: any) => {
    const updated = [...newColumns];
    updated[index] = { ...updated[index], [field]: value };
    setNewColumns(updated);
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 lg:p-12">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 lg:p-12">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">External Tables</h1>
          <p className="text-gray-600 mt-1">
            Define custom tables linked to documents for external data
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
        >
          + New External Table
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
          <button onClick={() => setError(null)} className="float-right font-bold">
            &times;
          </button>
        </div>
      )}

      {tables.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-500 mb-4">No external tables defined yet</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="text-purple-600 hover:text-purple-700 font-medium"
          >
            Create your first external table
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {tables.map((table) => (
            <div
              key={table.id}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{table.name}</h3>
                  <p className="text-sm text-gray-500">
                    Collection: {table.collection_name}
                  </p>
                  {table.description && (
                    <p className="text-sm text-gray-600 mt-1">{table.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      table.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {table.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2">
                  SQL Table: <code className="bg-gray-100 px-1 rounded">{table.sql_table_name}</code>
                </p>
                {table.columns.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {table.columns.map((col) => (
                      <div
                        key={col.id}
                        className="flex items-center gap-1 px-2 py-1 bg-blue-50 rounded text-sm"
                      >
                        <span className="font-medium text-blue-800">{col.name}</span>
                        <span className="text-blue-600">({col.data_type})</span>
                        {!table.is_active && (
                          <button
                            onClick={() => handleDeleteColumn(col)}
                            className="ml-1 text-red-500 hover:text-red-700"
                            title="Delete column"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                    {!table.is_active && (
                      <button
                        onClick={() => handleShowAddColumn(table)}
                        className="px-2 py-1 bg-gray-100 rounded text-sm text-gray-600 hover:bg-gray-200"
                      >
                        + Add Column
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">
                    No columns defined.{' '}
                    {!table.is_active && (
                      <button
                        onClick={() => handleShowAddColumn(table)}
                        className="text-purple-600 hover:underline"
                      >
                        Add columns
                      </button>
                    )}
                  </p>
                )}
              </div>

              {table.error_message && (
                <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                  {table.error_message}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleShowPreview(table)}
                  className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
                >
                  Preview SQL
                </button>
                {table.is_active ? (
                  <>
                    <button
                      onClick={() => handleDeactivate(table)}
                      disabled={!!actionLoading[table.id]}
                      className="px-3 py-1.5 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition-colors disabled:opacity-50"
                    >
                      {actionLoading[table.id] === 'deactivate' ? 'Deactivating...' : 'Deactivate'}
                    </button>
                    <button
                      onClick={() => handleRebuild(table)}
                      disabled={!!actionLoading[table.id]}
                      className="px-3 py-1.5 text-sm bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors disabled:opacity-50"
                    >
                      {actionLoading[table.id] === 'rebuild' ? 'Rebuilding...' : 'Rebuild'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleActivate(table)}
                    disabled={!!actionLoading[table.id] || table.columns.length === 0}
                    className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors disabled:opacity-50"
                    title={table.columns.length === 0 ? 'Add columns before activating' : ''}
                  >
                    {actionLoading[table.id] === 'activate' ? 'Activating...' : 'Activate'}
                  </button>
                )}
                <button
                  onClick={() => handleDelete(table)}
                  disabled={!!actionLoading[table.id]}
                  className="px-3 py-1.5 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors disabled:opacity-50"
                >
                  {actionLoading[table.id] === 'delete' ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Create External Table</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Collection *
                </label>
                <select
                  value={newTableCollection || ''}
                  onChange={(e) => setNewTableCollection(Number(e.target.value) || null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="">Select a collection</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Table Name *
                </label>
                <input
                  type="text"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="e.g., Approval Status"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newTableDescription}
                  onChange={(e) => setNewTableDescription(e.target.value)}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Columns
                  </label>
                  <button
                    onClick={addNewColumn}
                    className="text-sm text-purple-600 hover:text-purple-700"
                  >
                    + Add Column
                  </button>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  A <code>document_identifier</code> column is automatically added to link records to documents.
                </p>
                {newColumns.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No columns added yet</p>
                ) : (
                  <div className="space-y-2">
                    {newColumns.map((col, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={col.name}
                          onChange={(e) => updateNewColumn(idx, 'name', e.target.value)}
                          placeholder="Column name"
                          className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm"
                        />
                        <select
                          value={col.data_type}
                          onChange={(e) => updateNewColumn(idx, 'data_type', e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-sm"
                        >
                          {availableTypes.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="checkbox"
                            checked={col.is_nullable}
                            onChange={(e) => updateNewColumn(idx, 'is_nullable', e.target.checked)}
                          />
                          Nullable
                        </label>
                        <button
                          onClick={() => removeNewColumn(idx)}
                          className="text-red-500 hover:text-red-700"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
                disabled={isCreating || !newTableName || !newTableCollection}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {isCreating ? 'Creating...' : 'Create Table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {previewTable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">SQL Preview: {previewTable.name}</h2>
              <button
                onClick={() => setPreviewTable(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>

            {isLoadingPreview ? (
              <div className="animate-pulse py-8 text-center">Loading preview...</div>
            ) : preview ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Database Engine: <span className="font-mono">{preview.db_engine}</span>
                  </h3>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">CREATE TABLE SQL</h3>
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                    {preview.create_sql}
                  </pre>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">DROP TABLE SQL</h3>
                  <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                    {preview.drop_sql}
                  </pre>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setPreviewTable(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Column Modal */}
      {addColumnTable && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Add Column to {addColumnTable.name}</h2>
              <button
                onClick={() => setAddColumnTable(null)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Column Name *
                </label>
                <input
                  type="text"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="e.g., approval_status"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Type
                </label>
                <select
                  value={newColumnType}
                  onChange={(e) => setNewColumnType(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  {availableTypes.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={newColumnNullable}
                    onChange={(e) => setNewColumnNullable(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Allow NULL values</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setAddColumnTable(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddColumn}
                disabled={isAddingColumn || !newColumnName}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
              >
                {isAddingColumn ? 'Adding...' : 'Add Column'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExternalTablesPage;
