# Data Nexus Bridge Service

A Django REST Framework backend service for managing Affinda API integrations with a React frontend.

## Backend Setup

### Prerequisites

- Python 3.12+
- Virtual environment

### Installation

1. Activate the virtual environment:
   ```bash
   .venv\Scripts\activate  # Windows
   source .venv/bin/activate  # Linux/Mac
   ```

2. Install dependencies:
   ```bash
   pip install djangorestframework django-cors-headers django-filter httpx python-dotenv pytest pytest-django
   ```

3. Configure environment variables in `.env`:
   ```
   AFFINDA_API_KEY=your_api_key_here
   AFFINDA_ORG_ID=your_org_id_here
   DJANGO_SECRET_KEY=your_secret_key
   DJANGO_DEBUG=True
   DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
   ```

4. Run migrations:
   ```bash
   python manage.py migrate
   ```

5. Start the development server:
   ```bash
   python manage.py runserver
   ```

The API will be available at `http://localhost:8000/api/`

## API Endpoints

### Workspaces
- `GET /api/workspaces/` - List all workspaces
- `GET /api/workspaces/{identifier}/` - Get workspace details
- `POST /api/workspaces/sync/` - Sync workspaces from Affinda

### Collections
- `GET /api/collections/` - List all collections
- `GET /api/collections/{identifier}/` - Get collection details
- Query params: `?workspace=<workspace_id>`

### Field Definitions
- `GET /api/field-definitions/` - List all field definitions
- Query params: `?collection=<collection_id>`

### Data Points
- `GET /api/data-points/` - List all data points
- `GET /api/data-points/{identifier}/` - Get data point details

### Documents
- `GET /api/documents/` - List all documents
- `GET /api/documents/{id}/` - Get document details
- Query params: `?workspace=<workspace_id>&collection=<collection_id>&state=<state>`

## Frontend Setup

The React frontend is located in `frontend/`

### Installation

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The frontend will be available at `http://localhost:5173/`

## Running Tests

```bash
pytest
```

or with verbose output:
```bash
pytest -v
```

## Models

### Workspace
- Represents an Affinda workspace
- Contains collections of documents

### Collection
- Represents a collection within a workspace
- Contains field definitions and documents

### FieldDefinition
- Represents a field definition for a collection
- Links to a data point

### DataPoint
- Represents a reusable data point definition
- Can be used across multiple collections

### Document
- Represents a processed document
- Contains extracted data and metadata
- Has states: review, complete, archived

## Technologies

### Backend
- Django 6.0
- Django REST Framework
- Django CORS Headers
- Django Filters
- HTTPX (for Affinda API client)
- pytest & pytest-django

### Frontend
- React 18
- TypeScript
- Vite
- React Query (TanStack Query)
- Axios
- React Router

## License

MIT
