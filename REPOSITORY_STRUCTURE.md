# Repository Structure

This repository contains both the Django REST Framework backend and React frontend in a monorepo structure.

## Directory Layout

```
data-nexus-bridge-service/          # Root repository directory
│
├── affinda_bridge/                  # Django app for Affinda integration
│   ├── migrations/                  # Database migrations
│   ├── clients/                     # Affinda API client
│   │   └── affinda.py              # HTTP client for Affinda API
│   ├── tests/                       # Test files
│   │   ├── test_affinda_client.py  # API client tests
│   │   └── test_sync_field_definitions.py  # Sync endpoint tests
│   ├── api_views.py                # DRF ViewSets (API endpoints)
│   ├── models.py                   # Database models (Workspace, Collection, etc.)
│   ├── serializers.py              # DRF serializers
│   ├── urls.py                     # URL routing for API
│   └── views.py                    # Empty (migrated to api_views.py)
│
├── data_nexus_bridge_service/      # Django project settings
│   ├── settings.py                 # Django configuration (DRF, CORS, DB)
│   ├── urls.py                     # Main URL routing
│   ├── wsgi.py                     # WSGI server config
│   └── asgi.py                     # ASGI server config
│
├── frontend/                        # React frontend (TypeScript + Vite)
│   ├── src/
│   │   ├── api/
│   │   │   └── client.ts           # API client with types & endpoints
│   │   ├── pages/
│   │   │   ├── WorkspacesPage.tsx  # Workspaces list & sync
│   │   │   ├── CollectionsPage.tsx # Collections list
│   │   │   ├── DocumentsPage.tsx   # Documents table
│   │   │   └── WorkspacesPage.css  # Shared styles for pages
│   │   ├── App.tsx                 # Main app component with routing
│   │   ├── App.css                 # App-level styles
│   │   └── main.tsx                # React entry point
│   ├── .vscode/
│   │   ├── launch.json             # Debug configs for Chrome/Edge
│   │   ├── tasks.json              # NPM tasks
│   │   └── settings.json           # TypeScript/ESLint settings
│   ├── .env                        # Environment variables (API URL)
│   ├── package.json                # NPM dependencies
│   ├── tsconfig.json               # TypeScript configuration
│   └── vite.config.ts              # Vite build configuration
│
├── .vscode/                         # VS Code configuration (backend)
│   ├── launch.json                 # Debug configs for Django/pytest
│   ├── tasks.json                  # Django management tasks
│   └── settings.json               # Python/Django settings
│
├── .venv/                           # Python virtual environment
├── .env                             # Backend environment variables
├── .gitignore                       # Git ignore rules
├── manage.py                        # Django management script
├── pytest.ini                       # Pytest configuration
├── db.sqlite3                       # SQLite database (gitignored)
│
├── README.md                        # Main documentation
├── SETUP_COMPLETE.md               # Setup guide & quick start
├── DEBUGGING.md                    # Debugging guide for VS Code
└── REPOSITORY_STRUCTURE.md         # This file
```

## Key Files

### Backend Configuration

- **[.env](.env)** - Backend environment variables:
  - `AFFINDA_API_KEY` - Your Affinda API key
  - `AFFINDA_ORG_ID` - Your Affinda organization ID
  - `DJANGO_SECRET_KEY` - Django secret key
  - `DJANGO_DEBUG` - Enable/disable debug mode
  - `DJANGO_ALLOWED_HOSTS` - Allowed hosts for Django

- **[manage.py](manage.py)** - Django CLI tool for running server, migrations, etc.

- **[pytest.ini](pytest.ini)** - Pytest configuration with Django settings

### Frontend Configuration

- **[frontend/.env](frontend/.env)** - Frontend environment variables:
  - `VITE_API_BASE_URL` - Backend API URL (default: http://localhost:8000)

- **[frontend/package.json](frontend/package.json)** - NPM dependencies and scripts

- **[frontend/vite.config.ts](frontend/vite.config.ts)** - Vite build configuration

## Development Workflow

### Running Both Services

**Terminal 1 - Backend:**
```bash
.venv\Scripts\activate
python manage.py runserver
```
Runs at: http://localhost:8000

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```
Runs at: http://localhost:5173

### Running Tests

**Backend tests:**
```bash
pytest -v
```

**Frontend type checking:**
```bash
cd frontend
npx tsc --noEmit
```

### Database Migrations

**Create migrations:**
```bash
python manage.py makemigrations
```

**Apply migrations:**
```bash
python manage.py migrate
```

## API Endpoints

All API endpoints are prefixed with `/api/`:

- `GET /api/` - API root (lists all endpoints)
- `GET|POST /api/workspaces/` - Workspace list & create
- `POST /api/workspaces/sync/` - Sync from Affinda
- `GET /api/collections/` - Collection list
- `GET /api/field-definitions/` - Field definition list
- `GET /api/data-points/` - Data point list
- `GET /api/documents/` - Document list

## Frontend Pages

- **/** - Workspaces page with sync button
- **/collections** - Collections list
- **/documents** - Documents table

## Git Workflow

### What's Tracked

- All Python source code
- All TypeScript/React source code
- VS Code debug configurations (.vscode/)
- Configuration files (.env.example, package.json, etc.)
- Documentation (README.md, etc.)

### What's Ignored

- Python: `__pycache__/`, `.venv/`, `db.sqlite3`
- Frontend: `node_modules/`, `dist/`, `build/`
- Environment files: `.env` (use `.env.example` for templates)
- IDE files: `.idea/`, OS files: `.DS_Store`

## Technology Stack

### Backend
- **Python 3.12+**
- **Django 6.0** - Web framework
- **Django REST Framework** - REST API toolkit
- **django-cors-headers** - CORS middleware
- **django-filter** - Filtering support
- **httpx** - HTTP client for Affinda API
- **pytest + pytest-django** - Testing

### Frontend
- **Node.js 20+**
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **TanStack Query (React Query)** - Data fetching & caching
- **Axios** - HTTP client
- **React Router** - Client-side routing

## Deployment Considerations

### Backend

For production deployment:
1. Set `DJANGO_DEBUG=False` in `.env`
2. Configure `DJANGO_SECRET_KEY` with a strong random key
3. Set `DJANGO_ALLOWED_HOSTS` to your domain
4. Use PostgreSQL instead of SQLite
5. Configure static file serving (`collectstatic`)
6. Use gunicorn/uwsgi as WSGI server
7. Set up proper CORS origins in settings

### Frontend

For production build:
```bash
cd frontend
npm run build
```

This creates an optimized build in `frontend/dist/` that can be:
- Served via Django static files
- Deployed to Vercel/Netlify/CloudFlare Pages
- Served via Nginx/Apache

Update `VITE_API_BASE_URL` in production `.env` to point to your production API.

## Contributing

1. Create feature branch from `master`
2. Make changes
3. Run tests (`pytest -v`)
4. Commit with descriptive message
5. Create pull request

## License

MIT
