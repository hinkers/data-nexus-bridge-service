# Create Test User

To create a test user for logging into the application:

## Option 1: Using Django Shell (Recommended for Development)

```bash
.venv\Scripts\python manage.py shell
```

Then in the Python shell:

```python
from django.contrib.auth.models import User

# Create a test user
user = User.objects.create_user(
    username='admin',
    email='admin@example.com',
    password='admin123'
)

print(f"Created user: {user.username}")
exit()
```

## Option 2: Using createsuperuser (For Admin Access)

```bash
.venv\Scripts\python manage.py createsuperuser
```

Follow the prompts to enter:
- Username
- Email address (optional)
- Password
- Password confirmation

## Option 3: Quick Script

Save this as `create_test_user.py` and run it:

```python
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'data_nexus_bridge_service.settings')
django.setup()

from django.contrib.auth.models import User

# Create or update test user
user, created = User.objects.update_or_create(
    username='admin',
    defaults={
        'email': 'admin@example.com',
        'is_staff': True,
        'is_superuser': True,
    }
)

if created:
    user.set_password('admin123')
    user.save()
    print(f"✓ Created test user: {user.username}")
else:
    user.set_password('admin123')
    user.save()
    print(f"✓ Updated test user: {user.username}")

print(f"  Username: {user.username}")
print(f"  Password: admin123")
print(f"  Email: {user.email}")
```

Run it:
```bash
.venv\Scripts\python create_test_user.py
```

## Default Test Credentials

After creating the user with any method above:

**Username:** `admin`
**Password:** `admin123`

Use these credentials to login at http://localhost:5173/login

## Verifying the User

To verify the user was created:

```bash
.venv\Scripts\python manage.py shell
```

```python
from django.contrib.auth.models import User

user = User.objects.get(username='admin')
print(f"Username: {user.username}")
print(f"Email: {user.email}")
print(f"Is staff: {user.is_staff}")
print(f"Is superuser: {user.is_superuser}")

# Check if user can authenticate
from django.contrib.auth import authenticate
auth_user = authenticate(username='admin', password='admin123')
print(f"Can authenticate: {auth_user is not None}")
```

## Viewing All Users

```bash
.venv\Scripts\python manage.py shell
```

```python
from django.contrib.auth.models import User

for user in User.objects.all():
    print(f"- {user.username} ({user.email})")
```

## Creating Additional Users

You can create more users programmatically:

```python
from django.contrib.auth.models import User

users_data = [
    {'username': 'john', 'email': 'john@example.com', 'password': 'john123'},
    {'username': 'jane', 'email': 'jane@example.com', 'password': 'jane123'},
]

for data in users_data:
    user, created = User.objects.get_or_create(
        username=data['username'],
        defaults={'email': data['email']}
    )
    user.set_password(data['password'])
    user.save()
    print(f"{'Created' if created else 'Updated'}: {user.username}")
```

## Deleting a User

```python
from django.contrib.auth.models import User

user = User.objects.get(username='admin')
user.delete()
print(f"Deleted user: {user.username}")
```
