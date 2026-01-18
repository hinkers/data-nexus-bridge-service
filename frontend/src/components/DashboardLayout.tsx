import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface DashboardLayoutProps {
  children: ReactNode;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/dashboard/workspaces', label: 'Workspaces', icon: '📁' },
    { path: '/dashboard/collections', label: 'Collections', icon: '📑' },
    { path: '/dashboard/documents', label: 'Documents', icon: '📄' },
    { path: '/dashboard/sync-schedules', label: 'Sync Schedules', icon: '🔄' },
    { path: '/dashboard/reports', label: 'Reports', icon: '📈' },
    { path: '/dashboard/views', label: 'Views', icon: '📋' },
    { path: '/dashboard/external-tables', label: 'External Tables', icon: '🗃️' },
    { path: '/dashboard/plugins', label: 'Plugins', icon: '🔌' },
    { path: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-64 bg-gradient-to-b from-gray-800 to-gray-900 text-white flex flex-col shadow-xl fixed h-screen left-0 top-0">
        <div className="p-8 border-b border-white/10">
          <h2 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent mb-2">
            Data Nexus
          </h2>
          <p className="text-gray-400 text-sm">{user?.username}</p>
        </div>

        <nav className="flex-1 py-6 overflow-y-auto">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-3 px-6 py-3.5 text-gray-300 transition-all border-l-3 ${
                location.pathname === item.path
                  ? 'bg-purple-500/15 text-white border-l-purple-500'
                  : 'border-l-transparent hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="text-xl w-6 text-center">{item.icon}</span>
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-6 border-t border-white/10 space-y-2">
          {user?.is_staff && (
            <a
              href={`${API_BASE_URL}/admin/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 w-full px-4 py-3.5 bg-purple-500/10 text-purple-300 border border-purple-500/20 rounded-lg text-sm font-medium hover:bg-purple-500/20 hover:text-purple-200 transition-all"
            >
              <span className="text-xl">⚙️</span>
              <span>Admin Panel</span>
            </a>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-4 py-3.5 bg-red-500/10 text-red-300 border border-red-500/20 rounded-lg text-sm font-medium hover:bg-red-500/20 hover:text-red-200 transition-all"
          >
            <span className="text-xl">🚪</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="ml-64 flex-1 min-h-screen">
        {children}
      </main>
    </div>
  );
}

export default DashboardLayout;
