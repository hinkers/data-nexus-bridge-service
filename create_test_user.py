#!/usr/bin/env python
"""
Quick script to create a test user for development.
Usage: python create_test_user.py
"""
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

user.set_password('admin123')
user.save()

if created:
    print("[+] Created test user:")
else:
    print("[+] Updated test user:")

print(f"  Username: {user.username}")
print(f"  Password: admin123")
print(f"  Email: {user.email}")
print(f"  Is staff: {user.is_staff}")
print(f"  Is superuser: {user.is_superuser}")
print()
print("You can now login at http://localhost:5173/login")
