import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { collectionsApi, syncHistoryApi, syncSchedulesApi, type Collection, type DataSourceInstance, type SyncSchedule, type SyncScheduleRun } from '../api/client';

function SyncSchedulesPage() {
  const queryClient = useQueryClient();

  // State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<SyncSchedule | null>(null);
  const [selectedSchedule, setSelectedSchedule] = useState<SyncSchedule | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    sync_type: 'selective' as 'full_collection' | 'selective' | 'data_source',
    collection: '' as string | number,
    plugin_instance: '' as string | number,
    cron_expression: '*/15 6-19 * * 1-5',
    enabled: true,
  });

  // Queries
  const { data: schedules, isLoading } = useQuery({
    queryKey: ['sync-schedules'],
    queryFn: async () => {
      const response = await syncSchedulesApi.list();
      return response.data;
    },
  });

  const { data: collections } = useQuery({
    queryKey: ['collections'],
    queryFn: async () => {
      const response = await collectionsApi.list();
      return response.data;
    },
  });

  const { data: presets } = useQuery({
    queryKey: ['sync-schedules', 'presets'],
    queryFn: async () => {
      const response = await syncSchedulesApi.getPresets();
      return response.data;
    },
  });

  const { data: dataSourceInstances } = useQuery({
    queryKey: ['sync-schedules', 'data-source-instances'],
    queryFn: async () => {
      const response = await syncSchedulesApi.getDataSourceInstances();
      return response.data;
    },
  });

  const { data: scheduleHistory, isLoading: loadingHistory } = useQuery({
    queryKey: ['sync-schedules', selectedSchedule?.id, 'history'],
    queryFn: async () => {
      if (!selectedSchedule) return null;
      const response = await syncSchedulesApi.getHistory(selectedSchedule.id);
      return response.data;
    },
    enabled: !!selectedSchedule,
  });

  // Fetch all runs when no schedule is selected
  const { data: allRuns, isLoading: loadingAllRuns } = useQuery({
    queryKey: ['sync-schedules', 'all-runs'],
    queryFn: async () => {
      const response = await syncSchedulesApi.getAllRuns(50);
      return response.data;
    },
    enabled: !selectedSchedule,
  });

  // State for logs modal
  const [selectedSyncHistoryId, setSelectedSyncHistoryId] = useState<number | null>(null);

  // Query for sync logs
  const { data: syncLogs, isLoading: loadingLogs } = useQuery({
    queryKey: ['sync-logs', selectedSyncHistoryId],
    queryFn: async () => {
      if (!selectedSyncHistoryId) return null;
      const response = await syncHistoryApi.getLogs(selectedSyncHistoryId);
      return response.data;
    },
    enabled: !!selectedSyncHistoryId,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        ...data,
        collection: data.collection ? Number(data.collection) : undefined,
        plugin_instance: data.plugin_instance ? Number(data.plugin_instance) : undefined,
      };
      const response = await syncSchedulesApi.create(payload);
      return response.data;
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Schedule created successfully!' });
      setShowCreateModal(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['sync-schedules'] });
    },
    onError: (error: any) => {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || error.message || 'Failed to create schedule',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      const payload = {
        ...data,
        collection: data.collection ? Number(data.collection) : undefined,
        plugin_instance: data.plugin_instance ? Number(data.plugin_instance) : undefined,
      };
      const response = await syncSchedulesApi.update(id, payload);
      return response.data;
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Schedule updated successfully!' });
      setEditingSchedule(null);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['sync-schedules'] });
    },
    onError: (error: any) => {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || error.message || 'Failed to update schedule',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await syncSchedulesApi.delete(id);
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Schedule deleted successfully!' });
      if (selectedSchedule) setSelectedSchedule(null);
      queryClient.invalidateQueries({ queryKey: ['sync-schedules'] });
    },
    onError: (error: any) => {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || error.message || 'Failed to delete schedule',
      });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await syncSchedulesApi.runNow(id);
      return response.data;
    },
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Schedule triggered successfully!' });
      queryClient.invalidateQueries({ queryKey: ['sync-schedules'] });
    },
    onError: (error: any) => {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || error.message || 'Failed to run schedule',
      });
    },
  });

  const toggleEnabledMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      const response = await syncSchedulesApi.update(id, { enabled });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-schedules'] });
    },
    onError: (error: any) => {
      setMessage({
        type: 'error',
        text: error.response?.data?.detail || error.message || 'Failed to toggle schedule',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      sync_type: 'selective',
      collection: '',
      plugin_instance: '',
      cron_expression: '*/15 6-19 * * 1-5',
      enabled: true,
    });
  };

  const handleEdit = (schedule: SyncSchedule) => {
    setFormData({
      name: schedule.name,
      sync_type: schedule.sync_type,
      collection: schedule.collection || '',
      plugin_instance: schedule.plugin_instance || '',
      cron_expression: schedule.cron_expression,
      enabled: schedule.enabled,
    });
    setEditingSchedule(schedule);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate: full_collection requires a collection
    if (formData.sync_type === 'full_collection' && !formData.collection) {
      setMessage({ type: 'error', text: 'Full sync requires selecting a document type' });
      return;
    }

    // Validate: data_source requires a plugin instance
    if (formData.sync_type === 'data_source' && !formData.plugin_instance) {
      setMessage({ type: 'error', text: 'Data source sync requires selecting a plugin instance' });
      return;
    }

    if (editingSchedule) {
      updateMutation.mutate({ id: editingSchedule.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="p-6 md:p-8 lg:p-10 w-full max-w-7xl">
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Sync Schedules</h1>
            <p className="text-gray-500 mt-1">Configure automated document synchronization schedules</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create Schedule
          </button>
        </div>

        {/* Message */}
        {message && (
          <div className={`mt-4 p-4 rounded-lg ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            <div className="flex items-center justify-between">
              <span>{message.text}</span>
              <button
                onClick={() => setMessage(null)}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Schedules List */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-gray-900">Schedules</h2>

          {isLoading ? (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center text-gray-500">
              Loading schedules...
            </div>
          ) : schedules?.results && schedules.results.length > 0 ? (
            schedules.results.map((schedule: SyncSchedule) => (
              <div
                key={schedule.id}
                onClick={() => setSelectedSchedule(schedule)}
                className={`bg-white rounded-xl p-6 shadow-sm cursor-pointer transition-all hover:shadow-md ${
                  selectedSchedule?.id === schedule.id ? 'ring-2 ring-purple-500' : ''
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{schedule.name}</h3>
                    <p className="text-sm text-gray-500">{schedule.cron_description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                      schedule.sync_type === 'full_collection'
                        ? 'bg-blue-100 text-blue-700'
                        : schedule.sync_type === 'data_source'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {schedule.sync_type === 'full_collection' ? 'Full' : schedule.sync_type === 'data_source' ? 'Data Source' : 'Selective'}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleEnabledMutation.mutate({ id: schedule.id, enabled: !schedule.enabled });
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        schedule.enabled ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          schedule.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>
                    {schedule.sync_type === 'data_source' ? (
                      <>
                        <span className="font-medium">Plugin:</span> {schedule.plugin_instance_name || 'Not set'}
                      </>
                    ) : (
                      <>
                        <span className="font-medium">Document Type:</span> {schedule.collection_name || 'All'}
                      </>
                    )}
                  </div>
                  <div>
                    <span className="font-medium">Next Run:</span> {formatDate(schedule.next_run_at)}
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      runNowMutation.mutate(schedule.id);
                    }}
                    disabled={runNowMutation.isPending}
                    className="px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition disabled:opacity-50"
                  >
                    Run Now
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(schedule);
                    }}
                    className="px-3 py-1.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm('Are you sure you want to delete this schedule?')) {
                        deleteMutation.mutate(schedule.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                    className="px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center text-gray-500">
              No schedules configured. Create one to automate your syncs.
            </div>
          )}
        </div>

        {/* Schedule Details / History */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              {selectedSchedule ? 'Run History' : 'Recent Runs (All Schedules)'}
            </h2>
            {selectedSchedule && (
              <button
                onClick={() => setSelectedSchedule(null)}
                className="text-sm text-purple-600 hover:text-purple-800"
              >
                View all runs
              </button>
            )}
          </div>

          {/* Show all runs when no schedule is selected */}
          {!selectedSchedule ? (
            <div className="bg-white rounded-xl p-6 shadow-sm">
              {loadingAllRuns ? (
                <div className="text-center text-gray-500 py-4">Loading runs...</div>
              ) : allRuns?.runs && allRuns.runs.length > 0 ? (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {allRuns.runs.map((run: SyncScheduleRun) => (
                    <div
                      key={run.id}
                      className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition"
                      onClick={() => run.sync_history && setSelectedSyncHistoryId(run.sync_history)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                            run.sync_history_status === 'completed'
                              ? 'bg-green-100 text-green-700'
                              : run.sync_history_status === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {run.sync_history_status || 'Unknown'}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                            run.sync_type === 'full_collection'
                              ? 'bg-blue-100 text-blue-700'
                              : run.sync_type === 'data_source'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}>
                            {run.sync_type === 'full_collection' ? 'Full' : run.sync_type === 'data_source' ? 'Data Source' : 'Selective'}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">{formatDate(run.started_at)}</span>
                      </div>
                      <div className="text-sm font-medium text-gray-900 mb-1">{run.schedule_name}</div>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div className="flex items-center gap-4">
                          <span>
                            <span className="font-medium">Triggered:</span> {run.triggered_by}
                          </span>
                          <span>
                            <span className="font-medium">Documents:</span> {run.documents_synced || 0}
                          </span>
                        </div>
                        {run.error_message && (
                          <div className="text-red-600 truncate">
                            <span className="font-medium">Error:</span> {run.error_message}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-4">No runs yet</div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="mb-4 pb-4 border-b">
                <h3 className="font-semibold text-gray-900">{selectedSchedule.name}</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Last run: {formatDate(selectedSchedule.last_run_at)}
                </p>
              </div>

              {loadingHistory ? (
                <div className="text-center text-gray-500 py-4">Loading history...</div>
              ) : scheduleHistory?.runs && scheduleHistory.runs.length > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {scheduleHistory.runs.map((run: SyncScheduleRun) => (
                    <div
                      key={run.id}
                      className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition"
                      onClick={() => run.sync_history && setSelectedSyncHistoryId(run.sync_history)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                          run.sync_history_status === 'completed'
                            ? 'bg-green-100 text-green-700'
                            : run.sync_history_status === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {run.sync_history_status || 'Unknown'}
                        </span>
                        <span className="text-xs text-gray-500">{formatDate(run.started_at)}</span>
                      </div>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>
                          <span className="font-medium">Triggered by:</span> {run.triggered_by}
                        </div>
                        <div>
                          <span className="font-medium">Documents:</span> {run.documents_synced || 0}
                        </div>
                        {run.error_message && (
                          <div className="text-red-600">
                            <span className="font-medium">Error:</span> {run.error_message}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500 py-4">No run history yet</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingSchedule) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-semibold text-gray-900 mb-4">
              {editingSchedule ? 'Edit Schedule' : 'Create Schedule'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="Sync every 15 mins on Workdays"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {/* Sync Type */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Sync Type</label>
                <select
                  value={formData.sync_type}
                  onChange={(e) => setFormData({ ...formData, sync_type: e.target.value as 'full_collection' | 'selective' | 'data_source', collection: '', plugin_instance: '' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="selective">Selective Sync (sync_enabled documents only)</option>
                  <option value="full_collection">Full Collection Sync (all documents)</option>
                  <option value="data_source">Data Source Sync (sync data to Affinda)</option>
                </select>
              </div>

              {/* Document Type - only for document sync types */}
              {formData.sync_type !== 'data_source' && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Document Type {formData.sync_type === 'full_collection' && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    value={formData.collection}
                    onChange={(e) => setFormData({ ...formData, collection: e.target.value })}
                    required={formData.sync_type === 'full_collection'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">
                      {formData.sync_type === 'full_collection' ? 'Select a document type' : 'All document types'}
                    </option>
                    {collections?.results?.map((col: Collection) => (
                      <option key={col.id} value={col.id}>{col.name || col.identifier}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.sync_type === 'full_collection'
                      ? 'Required: Select which document type to sync'
                      : 'Optional: Leave empty to sync all document types'}
                  </p>
                </div>
              )}

              {/* Plugin Instance - only for data source sync type */}
              {formData.sync_type === 'data_source' && (
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">
                    Data Source Plugin <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.plugin_instance}
                    onChange={(e) => setFormData({ ...formData, plugin_instance: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">Select a data source plugin</option>
                    {dataSourceInstances?.instances?.map((instance: DataSourceInstance) => (
                      <option key={instance.id} value={instance.id}>
                        {instance.name} ({instance.plugin_name} - {instance.component_name})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Select the data source plugin instance to run
                  </p>
                  {dataSourceInstances?.instances?.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      No data source plugins available. Install and configure a data source plugin first.
                    </p>
                  )}
                </div>
              )}

              {/* Cron Expression */}
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Schedule</label>
                <input
                  type="text"
                  value={formData.cron_expression}
                  onChange={(e) => setFormData({ ...formData, cron_expression: e.target.value })}
                  required
                  placeholder="0 2 * * *"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
                />
                <p className="text-xs text-gray-500 mt-1">Cron expression (minute hour day month weekday)</p>

                {/* Presets */}
                {presets && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {presets.presets.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => setFormData({ ...formData, cron_expression: preset.value })}
                        className={`px-2 py-1 text-xs rounded border transition ${
                          formData.cron_expression === preset.value
                            ? 'bg-purple-100 border-purple-300 text-purple-700'
                            : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Enabled */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium text-gray-900">Enabled</span>
                  <p className="text-xs text-gray-500">When enabled, schedule will run automatically</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, enabled: !formData.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formData.enabled ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      formData.enabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingSchedule(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-medium disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingSchedule
                    ? 'Update'
                    : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sync Logs Modal */}
      {selectedSyncHistoryId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-4xl w-full mx-4 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-gray-900">Sync Logs</h3>
              <button
                onClick={() => setSelectedSyncHistoryId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loadingLogs ? (
              <div className="text-center text-gray-500 py-8">Loading logs...</div>
            ) : syncLogs?.entries && syncLogs.entries.length > 0 ? (
              <div className="flex-1 overflow-y-auto space-y-2">
                {syncLogs.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className={`p-3 rounded-lg border ${
                      entry.level === 'error'
                        ? 'bg-red-50 border-red-200'
                        : entry.level === 'warning'
                        ? 'bg-yellow-50 border-yellow-200'
                        : entry.level === 'debug'
                        ? 'bg-gray-50 border-gray-200'
                        : 'bg-blue-50 border-blue-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                          entry.level === 'error'
                            ? 'bg-red-100 text-red-700'
                            : entry.level === 'warning'
                            ? 'bg-yellow-100 text-yellow-700'
                            : entry.level === 'debug'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {entry.level.toUpperCase()}
                        </span>
                        {entry.document_identifier && (
                          <span className="text-xs text-gray-500">
                            Doc: {entry.document_identifier}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(entry.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">{entry.message}</p>
                    {entry.details && Object.keys(entry.details).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                          Details
                        </summary>
                        <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                          {JSON.stringify(entry.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-gray-500 py-8">No log entries found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SyncSchedulesPage;
