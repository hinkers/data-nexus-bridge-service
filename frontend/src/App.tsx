import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import './App.css';
import CollectionsPage from './pages/CollectionsPage';
import DocumentsPage from './pages/DocumentsPage';
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
        <div className="app">
          <nav className="nav">
            <h1>Data Nexus Bridge</h1>
            <div className="nav-links">
              <Link to="/">Workspaces</Link>
              <Link to="/collections">Collections</Link>
              <Link to="/documents">Documents</Link>
            </div>
          </nav>
          <main className="main">
            <Routes>
              <Route path="/" element={<WorkspacesPage />} />
              <Route path="/collections" element={<CollectionsPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
