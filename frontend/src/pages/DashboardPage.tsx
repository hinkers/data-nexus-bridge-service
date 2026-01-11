function DashboardPage() {
  return (
    <div className="p-12 w-full">
      <div className="mb-10">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-gray-600">Welcome to Data Nexus Bridge</p>
      </div>

      <div className="grid grid-cols-4 gap-6 mb-12">
        <div className="bg-white rounded-xl p-8 shadow-sm flex items-center gap-6 hover:-translate-y-0.5 hover:shadow-lg transition-all">
          <div className="text-5xl w-16 h-16 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex-shrink-0">
            📁
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Workspaces</h3>
            <p className="text-3xl font-bold text-gray-900">0</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-8 shadow-sm flex items-center gap-6 hover:-translate-y-0.5 hover:shadow-lg transition-all">
          <div className="text-5xl w-16 h-16 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex-shrink-0">
            📑
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Collections</h3>
            <p className="text-3xl font-bold text-gray-900">0</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-8 shadow-sm flex items-center gap-6 hover:-translate-y-0.5 hover:shadow-lg transition-all">
          <div className="text-5xl w-16 h-16 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex-shrink-0">
            📄
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Documents</h3>
            <p className="text-3xl font-bold text-gray-900">0</p>
          </div>
        </div>

        <div className="bg-white rounded-xl p-8 shadow-sm flex items-center gap-6 hover:-translate-y-0.5 hover:shadow-lg transition-all">
          <div className="text-5xl w-16 h-16 flex items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex-shrink-0">
            ✅
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-1">Status</h3>
            <p className="text-3xl font-bold text-gray-900">Ready</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl p-10 shadow-sm">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Getting Started</h2>
        <p className="text-gray-600 mb-6 leading-relaxed">Use the sidebar navigation to access different sections:</p>
        <ul className="space-y-2 text-gray-700 leading-relaxed pl-6 list-disc">
          <li><strong className="text-gray-900">Workspaces</strong> - View and sync your Affinda workspaces</li>
          <li><strong className="text-gray-900">Collections</strong> - Browse document collections</li>
          <li><strong className="text-gray-900">Documents</strong> - View processed documents</li>
        </ul>
      </div>
    </div>
  );
}

export default DashboardPage;
