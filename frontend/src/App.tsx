import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import DashboardLayout from './components/DashboardLayout';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import CollectionsPage from './pages/CollectionsPage';
import CollectionViewsPage from './pages/CollectionViewsPage';
import DashboardPage from './pages/DashboardPage';
import DocumentsPage from './pages/DocumentsPage';
import ExternalTablesPage from './pages/ExternalTablesPage';
import LoginPage from './pages/LoginPage';
import PluginsPage from './pages/PluginsPage';
import SettingsPage from './pages/SettingsPage';
import SyncSchedulesPage from './pages/SyncSchedulesPage';
import WorkspacesPage from './pages/WorkspacesPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <DashboardPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/workspaces"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <WorkspacesPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/collections"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <CollectionsPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/documents"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <DocumentsPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/plugins"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <PluginsPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/views"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <CollectionViewsPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/external-tables"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <ExternalTablesPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/settings"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <SettingsPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/sync-schedules"
              element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <SyncSchedulesPage />
                  </DashboardLayout>
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
