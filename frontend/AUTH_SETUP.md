# Authentication Setup

This document describes the authentication system added to the Data Nexus Bridge frontend.

## Features

- Login page with username/password authentication
- Protected routes requiring authentication
- Admin dashboard with sidebar navigation
- Logout functionality
- Persistent login (uses localStorage)

## Components

### Authentication Context
**Location:** `src/contexts/AuthContext.tsx`

Provides authentication state and methods throughout the app:
- `isAuthenticated` - Boolean indicating if user is logged in
- `user` - Current user object (username)
- `login(username, password)` - Login method (currently mock)
- `logout()` - Logout method

### Login Page
**Location:** `src/pages/LoginPage.tsx`

Features:
- Username and password inputs
- Error handling
- Loading states
- Redirects to dashboard on successful login

**Demo:** Use any username and password to login (mock authentication)

### Dashboard Layout
**Location:** `src/components/DashboardLayout.tsx`

Features:
- Fixed sidebar on the left
- Navigation menu with icons
- User info display
- Logout button at bottom of sidebar

### Dashboard Page
**Location:** `src/pages/DashboardPage.tsx`

Blank dashboard with:
- Welcome message
- Stat cards (placeholder data)
- Getting started guide

### Protected Route
**Location:** `src/components/ProtectedRoute.tsx`

Wrapper component that:
- Checks if user is authenticated
- Redirects to login if not authenticated
- Renders protected content if authenticated

## Routes

| Path | Component | Protected | Description |
|------|-----------|-----------|-------------|
| `/login` | LoginPage | No | Login form |
| `/dashboard` | DashboardPage | Yes | Main dashboard |
| `/dashboard/workspaces` | WorkspacesPage | Yes | Workspaces list |
| `/dashboard/collections` | CollectionsPage | Yes | Collections list |
| `/dashboard/documents` | DocumentsPage | Yes | Documents list |
| `/` | - | - | Redirects to `/dashboard` |

## Styling

### Login Page (`LoginPage.css`)
- Centered login box
- Gradient background
- Modern card design
- Form validation states

### Dashboard Layout (`DashboardLayout.css`)
- Dark gradient sidebar (260px wide)
- Fixed sidebar navigation
- Hover and active states for nav items
- Logout button styling

### Dashboard Content (`DashboardPage.css`)
- Stat cards with icons
- Grid layout responsive design
- Welcome section with instructions

## Authentication Flow

### Login
1. User visits any route
2. If not authenticated → redirected to `/login`
3. User enters credentials
4. `login()` method is called
5. On success:
   - User state is set
   - `isAuthenticated` set to true
   - Stored in localStorage
   - Redirect to `/dashboard`

### Logout
1. User clicks "Logout" button in sidebar
2. `logout()` method is called
3. User state cleared
4. `isAuthenticated` set to false
5. localStorage cleared
6. Redirect to `/login`

### Protected Routes
1. Route component wrapped in `<ProtectedRoute>`
2. Component checks `isAuthenticated`
3. If false → redirect to `/login`
4. If true → render protected content

## Persistence

Authentication state is persisted in localStorage:
- `isAuthenticated` - "true" or removed
- `user` - JSON stringified user object

This means users stay logged in across page refreshes.

## TODO: Connect to Django Backend

Currently using mock authentication. To connect to real Django backend:

### 1. Update AuthContext.tsx

Replace the `login` method:

```typescript
const login = async (username: string, password: string): Promise<boolean> => {
  try {
    const response = await axios.post('/api/auth/login/', {
      username,
      password,
    });

    const { token, user } = response.data;

    // Store token
    localStorage.setItem('authToken', token);

    // Update state
    setUser(user);
    setIsAuthenticated(true);
    localStorage.setItem('isAuthenticated', 'true');
    localStorage.setItem('user', JSON.stringify(user));

    return true;
  } catch (error) {
    return false;
  }
};
```

### 2. Add Token to API Requests

Update `src/api/client.ts`:

```typescript
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### 3. Add Django Authentication Endpoints

In Django backend:
- Add Django REST Framework authentication (Token or JWT)
- Create login endpoint: `POST /api/auth/login/`
- Create logout endpoint: `POST /api/auth/logout/`
- Add authentication to existing API endpoints

### 4. Handle Token Expiry

Add response interceptor:

```typescript
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired, logout user
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);
```

## Development Testing

**Login Credentials:**
- Any username + any password will work (mock auth)

**Try it:**
1. Start frontend: `npm run dev`
2. Visit http://localhost:5173
3. Should redirect to `/login`
4. Enter any credentials
5. Click "Sign in"
6. Should redirect to dashboard
7. Click through sidebar navigation
8. Click "Logout" to return to login

## Security Notes

⚠️ **Current Implementation:**
- Mock authentication (accepts any credentials)
- No password encryption
- No CSRF protection
- No rate limiting

✅ **Production Requirements:**
- Implement real Django authentication
- Use HTTPS only
- Add CSRF tokens
- Implement rate limiting
- Add password strength requirements
- Consider 2FA for admin users
- Implement proper session management
