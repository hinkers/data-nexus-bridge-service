import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface DashboardLayoutProps {
  children: ReactNode;
}

interface MenuItem {
  path: string;
  label: string;
  icon: ReactNode;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
  defaultOpen?: boolean;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// Simple SVG icons
const Icons = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1h-4a1 1 0 01-1-1v-6z" />
    </svg>
  ),
  reports: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  workspace: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
    </svg>
  ),
  collection: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  ),
  document: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  sync: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  view: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  table: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7c-2 0-3 1-3 3zm0 5h16M12 7v10" />
    </svg>
  ),
  plugin: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  chevron: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  ),
  admin: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  logout: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  ),
};

function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // Track which sections are expanded
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    main: true,
    data: true,
    config: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuSections: MenuSection[] = [
    {
      title: 'Main',
      defaultOpen: true,
      items: [
        { path: '/dashboard', label: 'Dashboard', icon: Icons.dashboard },
        { path: '/dashboard/reports', label: 'Reports', icon: Icons.reports },
      ],
    },
    {
      title: 'Data',
      defaultOpen: true,
      items: [
        { path: '/dashboard/workspaces', label: 'Workspaces', icon: Icons.workspace },
        { path: '/dashboard/collections', label: 'Document Types', icon: Icons.collection },
        { path: '/dashboard/documents', label: 'Documents', icon: Icons.document },
      ],
    },
    {
      title: 'Config',
      defaultOpen: true,
      items: [
        { path: '/dashboard/sync-schedules', label: 'Sync Schedules', icon: Icons.sync },
        { path: '/dashboard/views', label: 'Views', icon: Icons.view },
        { path: '/dashboard/external-tables', label: 'External Tables', icon: Icons.table },
        { path: '/dashboard/plugins', label: 'Plugins', icon: Icons.plugin },
        { path: '/dashboard/settings', label: 'Settings', icon: Icons.settings },
      ],
    },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-56 bg-gradient-to-b from-gray-800 to-gray-900 text-white flex flex-col shadow-xl fixed h-screen left-0 top-0">
        {/* Header */}
        <div className="p-5 border-b border-white/10">
          <h2 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Data Nexus
          </h2>
          <p className="text-gray-400 text-xs mt-1">{user?.username}</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {menuSections.map((section) => (
            <div key={section.title} className="mb-1">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.title.toLowerCase())}
                className="flex items-center justify-between w-full px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-300 transition-colors"
              >
                <span>{section.title}</span>
                <span className={`transform transition-transform duration-200 ${
                  expandedSections[section.title.toLowerCase()] ? 'rotate-0' : '-rotate-90'
                }`}>
                  {Icons.chevron}
                </span>
              </button>

              {/* Section Items */}
              <div className={`overflow-hidden transition-all duration-200 ${
                expandedSections[section.title.toLowerCase()] ? 'max-h-96' : 'max-h-0'
              }`}>
                {section.items.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-all border-l-2 ${
                      isActive(item.path)
                        ? 'bg-purple-500/15 text-white border-l-purple-500'
                        : 'border-l-transparent text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className={isActive(item.path) ? 'text-purple-400' : 'text-gray-500'}>
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 space-y-2">
          {user?.is_staff && (
            <a
              href={`${API_BASE_URL}/admin/`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 w-full px-3 py-2.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg text-sm transition-all"
            >
              <span className="text-gray-500">{Icons.admin}</span>
              <span>Admin Panel</span>
            </a>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg text-sm transition-all"
          >
            <span className="text-gray-500">{Icons.logout}</span>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <main className="ml-56 flex-1 min-h-screen">
        {children}
      </main>
    </div>
  );
}

export default DashboardLayout;
