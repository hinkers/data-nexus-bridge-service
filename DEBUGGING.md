# Debugging Guide

This guide covers debugging both the Django backend and React frontend using VS Code.

## Backend Debugging (Django)

### Setup

1. Make sure the Python extension for VS Code is installed:
   - `ms-python.python`
   - `ms-python.debugpy`

### Debug Configurations

Press `F5` or go to Run & Debug (`Ctrl+Shift+D`) and select:

#### Full Stack Debugging (Recommended)

##### 1. Full Stack: Django + React
- **Use for:** Debug both backend and frontend simultaneously
- **What it does:** Starts Django server (no reload) + launches Chrome with React app
- **Port:** Backend on 8000, Frontend on 5173
- **Features:** Set breakpoints in both Python and TypeScript code
- **Best for:** Full application debugging

##### 2. Full Stack: Django + React (Edge)
- Same as above but uses Microsoft Edge instead of Chrome

#### Backend Only

##### 3. Python: Django
- **Use for:** Normal Django development with auto-reload
- **Port:** 8000
- **Features:** Hot reload enabled, breakpoints work after server restart

##### 4. Python: Django (No Reload)
- **Use for:** When you need stable breakpoints
- **Port:** 8000
- **Features:** No auto-reload, breakpoints are stable
- **Best for:** Debugging specific issues that require multiple requests

##### 5. Python: pytest
- **Use for:** Debugging a specific test file
- **How to use:** Open a test file and press `F5`
- **Features:** Runs only the current test file with debugger attached

##### 6. Python: pytest (All Tests)
- **Use for:** Debugging test suite
- **Features:** Runs all tests with debugger attached

##### 7. Python: Django Shell
- **Use for:** Interactive debugging in Django shell
- **Features:** Access to all models and Django functionality

#### Frontend Only

##### 8. Frontend: Launch Chrome
- **Use for:** Debug React app in Chrome
- **Port:** 5173
- **Features:** Source maps enabled, React DevTools work
- **Note:** Automatically starts Vite dev server

##### 9. Frontend: Launch Edge
- **Use for:** Debug React app in Edge
- Same as Chrome but uses Edge browser

##### 10. Frontend: Attach to Chrome
- **Use for:** Attach to already running Chrome instance
- **Requirements:** Start Chrome with `--remote-debugging-port=9222`

### Setting Breakpoints

1. Click in the gutter (left of line numbers) to set a breakpoint
2. Red dot appears
3. When code execution hits the breakpoint, debugger pauses

### Debug Actions

- `F5` - Continue
- `F10` - Step Over
- `F11` - Step Into
- `Shift+F11` - Step Out
- `Ctrl+Shift+F5` - Restart
- `Shift+F5` - Stop

### Useful Tasks (Ctrl+Shift+P → Tasks: Run Task)

**Backend Tasks:**
- **Run Django Server** - Start server without debugger
- **Run Tests** - Run pytest without debugger
- **Make Migrations** - Create new migrations
- **Run Migrations** - Apply migrations
- **Django Shell** - Open Django shell
- **Create Superuser** - Create admin user

**Frontend Tasks:**
- **Start Frontend Dev Server** - Start Vite dev server (background)
- **Build Frontend** - Production build
- **Frontend Type Check** - Run TypeScript compiler check

### Example: Debugging an API View

```python
# In affinda_bridge/api_views.py
class WorkspaceViewSet(viewsets.ReadOnlyModelViewSet):
    @action(detail=False, methods=["post"])
    def sync(self, request):
        organization = os.environ.get("AFFINDA_ORG_ID")
        # Set breakpoint here ↓
        if not organization:
            return Response(...)
```

1. Set breakpoint on the `if not organization:` line
2. Press `F5` → Select "Python: Django (No Reload)"
3. In another terminal or Postman, make a POST request to `http://localhost:8000/api/workspaces/sync/`
4. Debugger will pause at breakpoint
5. Inspect variables in Debug sidebar

### Debugging Tests

```python
# In affinda_bridge/tests/test_affinda_client.py
def test_list_workspaces_builds_request(monkeypatch):
    # Set breakpoint here ↓
    monkeypatch.setenv("AFFINDA_API_KEY", "test-key")
    ...
```

1. Open the test file
2. Set breakpoint
3. Press `F5` → Select "Python: pytest"
4. Debugger pauses at breakpoint

### Debug Console

When paused at a breakpoint, use the Debug Console to:

```python
# Evaluate expressions
organization
request.data
self.queryset.count()

# Call functions
print(workspace)
Workspace.objects.all()

# Check environment
import os
os.environ.get("AFFINDA_API_KEY")
```

## Frontend Debugging (React)

### Setup

1. Make sure you have one of these VS Code extensions:
   - **Debugger for Chrome** (`msjsdiag.debugger-for-chrome`)
   - **Debugger for Edge** (`msjsdiag.debugger-for-microsoft-edge`)

2. Start the Vite dev server first:
   ```bash
   cd data-nexus-frontend
   npm run dev
   ```

### Debug Configurations

#### 1. Launch Chrome
- **Use for:** Launch Chrome with debugging enabled
- **URL:** http://localhost:5173
- **Features:** Source maps enabled, React DevTools work

#### 2. Launch Edge
- **Use for:** Launch Edge with debugging enabled
- **URL:** http://localhost:5173
- **Features:** Source maps enabled

#### 3. Attach to Chrome
- **Use for:** Attach to existing Chrome instance
- **Requirements:** Start Chrome with `--remote-debugging-port=9222`

### Setting Breakpoints

You can set breakpoints in:
- `.tsx` files
- `.ts` files
- Inline in Chrome DevTools

```typescript
// In src/pages/WorkspacesPage.tsx
const { data, isLoading, error } = useQuery({
  queryKey: ['workspaces'],
  queryFn: async () => {
    // Set breakpoint here ↓
    const response = await workspacesApi.list();
    return response.data;
  },
});
```

### Browser DevTools

Even without VS Code debugging, you can use browser DevTools:

1. Press `F12` in browser
2. Go to Sources tab
3. Find your files under `localhost:5173/src/`
4. Set breakpoints by clicking line numbers
5. Trigger code execution (button click, page load, etc.)

### Debugging React Components

#### Using Browser DevTools

1. Install React DevTools extension
2. Open DevTools → Components tab
3. Inspect component props, state, hooks

#### Using console.log strategically

```typescript
const WorkspacesPage = () => {
  const { data, isLoading } = useQuery({...});

  // Log when component renders
  console.log('WorkspacesPage render:', { data, isLoading });

  // Log in event handlers
  const handleSync = () => {
    console.log('Sync clicked');
    syncMutation.mutate();
  };

  return <div>...</div>;
};
```

#### Using debugger statement

```typescript
const handleSync = () => {
  debugger; // Execution pauses here
  syncMutation.mutate();
};
```

### Network Debugging

1. Open DevTools → Network tab
2. Filter by "Fetch/XHR"
3. Watch API calls to `http://localhost:8000/api/`
4. Click a request to see:
   - Headers
   - Request payload
   - Response data
   - Timing

### Common Issues

#### CORS errors
- Check browser console for CORS errors
- Verify Django settings has correct CORS_ALLOWED_ORIGINS
- Ensure backend is running on port 8000

#### API not responding
- Check Network tab for failed requests
- Verify backend is running
- Check API URL in `.env` file

#### TypeScript errors
- Open Problems panel (`Ctrl+Shift+M`)
- Run "Type Check" task to see all errors
- Common fix: `npm install`

### React Query DevTools

Add React Query DevTools for debugging queries:

```bash
npm install @tanstack/react-query-devtools
```

```typescript
// In App.tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* ... your app */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

Shows:
- All queries and their states
- Cache data
- Query refetching
- Manual query invalidation

## Full Stack Debugging

### Quick Start: Debug Both Backend & Frontend

The easiest way to debug the entire application:

1. Press `F5` in VS Code
2. Select **"Full Stack: Django + React"**
3. Both Django backend and React frontend start with debuggers attached
4. Set breakpoints in Python files (`.py`) and TypeScript files (`.tsx`, `.ts`)
5. Interact with the app in the browser that opens

### How It Works

The "Full Stack" debug configuration:
- Starts Django server on port 8000 (with debugger)
- Starts Vite dev server on port 5173 (background task)
- Launches Chrome with the React app (with debugger)
- Links both debuggers to VS Code

### Debugging a Complete Request Flow

**Example: Debug the sync workspaces feature**

1. **Press `F5`** → Select "Full Stack: Django + React"

2. **Set backend breakpoint:**
   ```python
   # In affinda_bridge/api_views.py
   class WorkspaceViewSet(viewsets.ReadOnlyModelViewSet):
       @action(detail=False, methods=["post"])
       def sync(self, request):
           organization = os.environ.get("AFFINDA_ORG_ID")
           # Set breakpoint here ↓
           if not organization:
               return Response(...)
   ```

3. **Set frontend breakpoint:**
   ```typescript
   // In frontend/src/pages/WorkspacesPage.tsx
   const syncMutation = useMutation({
     mutationFn: () => {
       // Set breakpoint here ↓
       return workspacesApi.sync();
     },
     onSuccess: () => { ... }
   });
   ```

4. **In the browser** that opened:
   - Navigate to Workspaces page
   - Click "Sync from Affinda" button

5. **Observe the flow:**
   - Debugger pauses in TypeScript at frontend breakpoint
   - Press `F5` (Continue)
   - HTTP request is sent to Django
   - Debugger pauses in Python at backend breakpoint
   - Inspect `request.data`, `organization`, etc.
   - Press `F5` (Continue)
   - Response returns to frontend

### Debugging Only Backend or Frontend

If you only need to debug one side:

**Backend only:**
- `F5` → "Python: Django (No Reload)"

**Frontend only:**
- `F5` → "Frontend: Launch Chrome"
- (This automatically starts the Vite dev server)

### Stopping Debuggers

When running "Full Stack" mode:
- Press `Shift+F5` to stop all debuggers
- Or click the red square "Stop" button in Debug toolbar

This stops both Django and Chrome debuggers.

## Tips & Tricks

### Backend

- **Use ipdb for interactive debugging:**
  ```bash
  pip install ipdb
  ```
  ```python
  import ipdb; ipdb.set_trace()  # Like debugger statement
  ```

- **Log SQL queries:**
  ```python
  # In settings.py
  LOGGING = {
      'loggers': {
          'django.db.backends': {
              'level': 'DEBUG',
          },
      },
  }
  ```

- **Django Debug Toolbar:** (for development only)
  ```bash
  pip install django-debug-toolbar
  ```

### Frontend

- **Redux DevTools** (if you add Redux later)
- **Network tab persistence:** Check "Preserve log" to keep logs across page refreshes
- **Conditional breakpoints:** Right-click breakpoint → Edit Breakpoint → Add condition

### Performance

- **Django Silk** for profiling:
  ```bash
  pip install django-silk
  ```

- **React Profiler:**
  ```typescript
  import { Profiler } from 'react';

  <Profiler id="WorkspacesPage" onRender={onRenderCallback}>
    <WorkspacesPage />
  </Profiler>
  ```

## Quick Reference

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Start Debugging | `F5` |
| Toggle Breakpoint | `F9` |
| Step Over | `F10` |
| Step Into | `F11` |
| Step Out | `Shift+F11` |
| Continue | `F5` |
| Stop | `Shift+F5` |
| Debug Console | `Ctrl+Shift+Y` |
| Problems Panel | `Ctrl+Shift+M` |

### Debug Panels

- **Variables** - Inspect local/global variables
- **Watch** - Add expressions to watch
- **Call Stack** - See function call hierarchy
- **Breakpoints** - Manage all breakpoints
- **Debug Console** - Execute code at breakpoint

Happy debugging! 🐛🔍
