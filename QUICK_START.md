# Quick Start Guide

Get the Data Nexus Bridge Service up and running in minutes!

## Prerequisites

- Python 3.12+ installed
- Node.js 20.0+ installed (tested with 20.11.1)
- VS Code (recommended)

## 1. Backend Setup (Django)

```bash
# Activate virtual environment
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac

# Install dependencies (if not already done)
pip install djangorestframework django-cors-headers django-filter httpx python-dotenv pytest pytest-django

# Configure environment
# Edit .env file with your Affinda credentials:
# AFFINDA_API_KEY=your_key_here
# AFFINDA_ORG_ID=your_org_id_here

# Run migrations
python manage.py migrate

# Start Django server
python manage.py runserver
```

Backend runs at: **http://localhost:8000**

## 2. Frontend Setup (React)

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies (if not already done)
npm install

# Start Vite dev server
npm run dev
```

Frontend runs at: **http://localhost:5173**

## 3. Quick Test

1. Open browser to http://localhost:5173
2. You should see the Data Nexus Bridge interface
3. Click "Sync from Affinda" to import your workspaces
4. Browse Workspaces, Collections, and Documents

## VS Code Debugging (Fastest Way!)

Instead of manually starting both servers:

1. Open the project in VS Code
2. Press `F5`
3. Select **"Full Stack: Django + React"**
4. Both servers start and Chrome opens automatically with debuggers attached!

## API Endpoints

Once backend is running, visit: http://localhost:8000/api/

Available endpoints:
- `GET /api/workspaces/` - List workspaces
- `POST /api/workspaces/sync/` - Sync from Affinda
- `GET /api/collections/` - List collections
- `GET /api/documents/` - List documents
- And more...

## Running Tests

```bash
# Backend tests
pytest -v

# Frontend type checking
cd frontend
npx tsc --noEmit
```

## Common Issues

### Backend won't start
- Check `.env` file exists with correct credentials
- Verify virtual environment is activated
- Run `python manage.py migrate`

### Frontend won't start
- Run `npm install` in frontend directory
- Check Node.js version: `node --version` (should be 20.0+, tested with 20.11.1)
- If you see Vite errors about Node.js version, the packages have been configured to work with Node 20.11+
- Delete `node_modules` and `package-lock.json`, then `npm install`

### CORS errors
- Ensure backend is running on port 8000
- Check `frontend/.env` has `VITE_API_BASE_URL=http://localhost:8000`

### Can't sync from Affinda
- Verify `AFFINDA_API_KEY` and `AFFINDA_ORG_ID` in backend `.env`
- Check credentials are valid on Affinda dashboard

## Next Steps

- Read [README.md](README.md) for detailed documentation
- See [DEBUGGING.md](DEBUGGING.md) for debugging guide
- Check [REPOSITORY_STRUCTURE.md](REPOSITORY_STRUCTURE.md) for codebase overview
- View [SETUP_COMPLETE.md](SETUP_COMPLETE.md) for what was built

## Development Workflow

### Making Changes

**Backend changes:**
1. Edit Python files in `affinda_bridge/` or `data_nexus_bridge_service/`
2. Django auto-reloads (or restart server)
3. Test with `pytest`

**Frontend changes:**
1. Edit TypeScript/React files in `frontend/src/`
2. Vite auto-reloads in browser
3. Type check with `npx tsc --noEmit`

### Creating Migrations

After modifying models:
```bash
python manage.py makemigrations
python manage.py migrate
```

### Adding NPM Packages

```bash
cd frontend
npm install package-name
```

### Committing Changes

```bash
git add .
git commit -m "Your message"
git push
```

## Project Structure

```
data-nexus-bridge-service/
├── affinda_bridge/       # Django app
│   ├── api_views.py     # API endpoints
│   ├── models.py        # Database models
│   └── serializers.py   # DRF serializers
├── frontend/            # React app
│   └── src/
│       ├── api/         # API client
│       └── pages/       # React pages
├── manage.py            # Django CLI
└── README.md            # Full docs
```

Happy coding! 🚀
