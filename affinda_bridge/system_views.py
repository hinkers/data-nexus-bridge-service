"""
System-level API views for application settings, version info, and updates.
"""
import subprocess
import os
from pathlib import Path

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response


def get_git_info() -> dict:
    """Get current git repository information."""
    base_dir = settings.BASE_DIR

    try:
        # Get current commit hash
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        current_commit = result.stdout.strip() if result.returncode == 0 else None

        # Get current commit short hash
        result = subprocess.run(
            ['git', 'rev-parse', '--short', 'HEAD'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        current_commit_short = result.stdout.strip() if result.returncode == 0 else None

        # Get current branch
        result = subprocess.run(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        current_branch = result.stdout.strip() if result.returncode == 0 else None

        # Get last commit date
        result = subprocess.run(
            ['git', 'log', '-1', '--format=%ci'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        last_commit_date = result.stdout.strip() if result.returncode == 0 else None

        # Get last commit message
        result = subprocess.run(
            ['git', 'log', '-1', '--format=%s'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        last_commit_message = result.stdout.strip() if result.returncode == 0 else None

        # Get remote URL
        result = subprocess.run(
            ['git', 'remote', 'get-url', 'origin'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        remote_url = result.stdout.strip() if result.returncode == 0 else None

        # Check for uncommitted changes
        result = subprocess.run(
            ['git', 'status', '--porcelain'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        has_uncommitted_changes = bool(result.stdout.strip()) if result.returncode == 0 else None

        return {
            'current_commit': current_commit,
            'current_commit_short': current_commit_short,
            'current_branch': current_branch,
            'last_commit_date': last_commit_date,
            'last_commit_message': last_commit_message,
            'remote_url': remote_url,
            'has_uncommitted_changes': has_uncommitted_changes,
            'is_git_repo': True,
        }

    except Exception as e:
        return {
            'is_git_repo': False,
            'error': str(e),
        }


def check_for_updates() -> dict:
    """Check if there are updates available from the remote repository."""
    base_dir = settings.BASE_DIR

    try:
        # Fetch latest from remote (without merging)
        result = subprocess.run(
            ['git', 'fetch', 'origin'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            return {
                'update_available': False,
                'error': f'Failed to fetch: {result.stderr}',
            }

        # Get current branch
        result = subprocess.run(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        current_branch = result.stdout.strip() if result.returncode == 0 else 'master'

        # Get local commit
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        local_commit = result.stdout.strip() if result.returncode == 0 else None

        # Get remote commit
        result = subprocess.run(
            ['git', 'rev-parse', f'origin/{current_branch}'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        remote_commit = result.stdout.strip() if result.returncode == 0 else None

        # Count commits behind
        result = subprocess.run(
            ['git', 'rev-list', '--count', f'HEAD..origin/{current_branch}'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        commits_behind = int(result.stdout.strip()) if result.returncode == 0 else 0

        # Count commits ahead
        result = subprocess.run(
            ['git', 'rev-list', '--count', f'origin/{current_branch}..HEAD'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        commits_ahead = int(result.stdout.strip()) if result.returncode == 0 else 0

        # Get new commits info if behind
        new_commits = []
        if commits_behind > 0:
            result = subprocess.run(
                ['git', 'log', '--oneline', f'HEAD..origin/{current_branch}', '-n', '10'],
                cwd=base_dir,
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if line:
                        parts = line.split(' ', 1)
                        new_commits.append({
                            'hash': parts[0],
                            'message': parts[1] if len(parts) > 1 else '',
                        })

        return {
            'update_available': commits_behind > 0,
            'local_commit': local_commit,
            'remote_commit': remote_commit,
            'commits_behind': commits_behind,
            'commits_ahead': commits_ahead,
            'new_commits': new_commits,
            'current_branch': current_branch,
        }

    except Exception as e:
        return {
            'update_available': False,
            'error': str(e),
        }


def pull_updates() -> dict:
    """Pull updates from the remote repository."""
    base_dir = settings.BASE_DIR

    try:
        # First check for uncommitted changes
        result = subprocess.run(
            ['git', 'status', '--porcelain'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )

        if result.stdout.strip():
            return {
                'success': False,
                'error': 'Cannot update: You have uncommitted changes. Please commit or stash them first.',
                'has_uncommitted_changes': True,
            }

        # Get current branch
        result = subprocess.run(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        current_branch = result.stdout.strip() if result.returncode == 0 else 'master'

        # Pull updates
        result = subprocess.run(
            ['git', 'pull', 'origin', current_branch],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            return {
                'success': False,
                'error': f'Git pull failed: {result.stderr}',
                'output': result.stdout,
            }

        # Get new commit hash
        result_hash = subprocess.run(
            ['git', 'rev-parse', '--short', 'HEAD'],
            cwd=base_dir,
            capture_output=True,
            text=True,
            timeout=10,
        )
        new_commit = result_hash.stdout.strip() if result_hash.returncode == 0 else None

        return {
            'success': True,
            'message': 'Update successful',
            'output': result.stdout,
            'new_commit': new_commit,
            'requires_restart': True,
        }

    except Exception as e:
        return {
            'success': False,
            'error': str(e),
        }


@api_view(['GET'])
def version_info(request):
    """
    Get version and git information about the application.
    """
    git_info = get_git_info()

    # Application version (could be from a VERSION file or settings)
    version_file = settings.BASE_DIR / 'VERSION'
    if version_file.exists():
        app_version = version_file.read_text().strip()
    else:
        app_version = '1.0.0'

    return Response({
        'app_version': app_version,
        'git': git_info,
        'debug_mode': settings.DEBUG,
        'database_engine': settings.DATABASES['default']['ENGINE'],
    })


@api_view(['GET'])
def check_updates(request):
    """
    Check if updates are available from the remote repository.
    """
    git_info = get_git_info()

    if not git_info.get('is_git_repo'):
        return Response({
            'update_available': False,
            'error': 'Not a git repository',
        })

    update_info = check_for_updates()
    return Response(update_info)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def apply_updates(request):
    """
    Pull updates from the remote repository.
    Requires admin permissions.
    """
    git_info = get_git_info()

    if not git_info.get('is_git_repo'):
        return Response({
            'success': False,
            'error': 'Not a git repository',
        }, status=status.HTTP_400_BAD_REQUEST)

    result = pull_updates()

    if result['success']:
        return Response(result)
    else:
        return Response(result, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
def system_status(request):
    """
    Get overall system status including database, plugins, etc.
    """
    from plugins.registry import plugin_registry
    from plugins.models import Plugin, PluginInstance

    # Database check
    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        db_status = 'connected'
    except Exception as e:
        db_status = f'error: {str(e)}'

    # Plugin info
    plugin_registry.autodiscover()
    installed_plugins = Plugin.objects.count()
    active_instances = PluginInstance.objects.filter(enabled=True).count()

    return Response({
        'database': {
            'status': db_status,
            'engine': settings.DATABASES['default']['ENGINE'],
        },
        'plugins': {
            'available': len(plugin_registry._plugins),
            'installed': installed_plugins,
            'active_instances': active_instances,
        },
        'debug_mode': settings.DEBUG,
    })


@api_view(['GET'])
@permission_classes([IsAdminUser])
def get_affinda_settings(request):
    """
    Get current Affinda API settings.
    Requires admin permissions.
    """
    from affinda_bridge.serializers import AffindaSettingsSerializer

    serializer = AffindaSettingsSerializer(instance={})
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def update_affinda_settings(request):
    """
    Update Affinda API settings.
    Requires admin permissions.
    """
    from affinda_bridge.serializers import AffindaSettingsSerializer

    serializer = AffindaSettingsSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        # Return the updated settings (with masked API key)
        response_serializer = AffindaSettingsSerializer(instance={})
        return Response(response_serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def test_affinda_connection(request):
    """
    Test the Affinda API connection with current settings.
    Requires admin permissions.
    """
    from affinda_bridge.clients import AffindaClient
    from affinda_bridge.models import SystemSettings

    try:
        # Get API key from database or environment
        api_key = SystemSettings.get_value(SystemSettings.SETTING_AFFINDA_API_KEY)
        if not api_key:
            api_key = os.environ.get("AFFINDA_API_KEY", "")

        base_url = SystemSettings.get_value(SystemSettings.SETTING_AFFINDA_BASE_URL)
        if not base_url:
            base_url = os.environ.get("AFFINDA_BASE_URL", "https://api.affinda.com")

        if not api_key:
            return Response({
                'success': False,
                'message': 'No API key configured. Please set the API key first.',
            }, status=status.HTTP_400_BAD_REQUEST)

        # Try to connect and fetch workspaces
        with AffindaClient(api_key=api_key, base_url=base_url) as client:
            organization = SystemSettings.get_value(SystemSettings.SETTING_AFFINDA_ORGANIZATION)
            if not organization:
                organization = os.environ.get("AFFINDA_ORGANIZATION", "") or os.environ.get("AFFINDA_ORG_ID", "")

            if organization:
                workspaces = client.list_workspaces(organization=organization)
                return Response({
                    'success': True,
                    'message': f'Connection successful! Found {len(workspaces)} workspace(s).',
                    'workspaces_count': len(workspaces),
                })
            else:
                # Can't list workspaces without organization, but connection is valid
                return Response({
                    'success': True,
                    'message': 'API key is valid. Set an organization ID to list workspaces.',
                })

    except ValueError as e:
        return Response({
            'success': False,
            'message': str(e),
        }, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Connection failed: {str(e)}',
        }, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([IsAdminUser])
def clear_affinda_api_key(request):
    """
    Clear the stored Affinda API key from the database.
    This will cause the system to fall back to environment variable.
    Requires admin permissions.
    """
    from affinda_bridge.models import SystemSettings

    try:
        SystemSettings.objects.filter(key=SystemSettings.SETTING_AFFINDA_API_KEY).delete()
        return Response({
            'success': True,
            'message': 'API key cleared from database. System will use environment variable if set.',
        })
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Failed to clear API key: {str(e)}',
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@permission_classes([IsAdminUser])
def get_webhook_config(request):
    """
    Get current webhook configuration.
    Requires admin permissions.
    """
    from affinda_bridge.models import WebhookConfiguration

    config = WebhookConfiguration.get_config()

    # Build the webhook URL
    webhook_url = request.build_absolute_uri(f'/api/webhooks/affinda/{config.secret_token}/')

    return Response({
        'enabled': config.enabled,
        'webhook_url': webhook_url,
        'secret_token': config.secret_token,
        'enabled_events': config.enabled_events,
        'available_events': [
            {'value': event[0], 'label': event[1]}
            for event in WebhookConfiguration.SUPPORTED_EVENTS
        ],
    })


@api_view(['POST'])
@permission_classes([IsAdminUser])
def update_webhook_config(request):
    """
    Update webhook configuration.
    Requires admin permissions.
    """
    from affinda_bridge.models import WebhookConfiguration

    config = WebhookConfiguration.get_config()

    # Update fields if provided
    if 'enabled' in request.data:
        config.enabled = request.data['enabled']

    if 'enabled_events' in request.data:
        # Validate event types
        valid_events = [e[0] for e in WebhookConfiguration.SUPPORTED_EVENTS]
        enabled_events = request.data['enabled_events']

        if not isinstance(enabled_events, list):
            return Response({
                'error': 'enabled_events must be a list',
            }, status=status.HTTP_400_BAD_REQUEST)

        invalid_events = [e for e in enabled_events if e not in valid_events]
        if invalid_events:
            return Response({
                'error': f'Invalid event types: {invalid_events}',
            }, status=status.HTTP_400_BAD_REQUEST)

        config.enabled_events = enabled_events

    config.save()

    # Build the webhook URL
    webhook_url = request.build_absolute_uri(f'/api/webhooks/affinda/{config.secret_token}/')

    return Response({
        'enabled': config.enabled,
        'webhook_url': webhook_url,
        'secret_token': config.secret_token,
        'enabled_events': config.enabled_events,
    })


@api_view(['POST'])
@permission_classes([IsAdminUser])
def regenerate_webhook_token(request):
    """
    Regenerate the webhook secret token.
    This will invalidate the previous webhook URL.
    Requires admin permissions.
    """
    from affinda_bridge.models import WebhookConfiguration

    config = WebhookConfiguration.get_config()
    config.secret_token = WebhookConfiguration.generate_secret_token()
    config.save()

    # Build the new webhook URL
    webhook_url = request.build_absolute_uri(f'/api/webhooks/affinda/{config.secret_token}/')

    return Response({
        'success': True,
        'message': 'Webhook token regenerated. Update your Affinda webhook configuration with the new URL.',
        'webhook_url': webhook_url,
        'secret_token': config.secret_token,
    })


@api_view(['GET'])
def system_reports(request):
    """
    Get system health reports and statistics.
    Accepts optional 'days' query parameter for time range (default: 7).
    """
    from datetime import timedelta
    from django.db.models import Count, Q
    from django.utils import timezone

    from affinda_bridge.models import (
        Collection,
        Document,
        SyncHistory,
        SyncSchedule,
        SyncScheduleRun,
    )
    from plugins.models import Plugin, PluginExecutionLog, PluginInstance

    # Get time range from query params (default 7 days)
    try:
        days = int(request.query_params.get('days', 7))
        days = max(1, min(days, 365))  # Clamp between 1 and 365
    except (ValueError, TypeError):
        days = 7

    now = timezone.now()
    time_threshold = now - timedelta(days=days)

    # === Document Statistics ===
    total_documents = Document.objects.count()
    documents_by_state = Document.objects.values('state').annotate(count=Count('id'))
    state_counts = {item['state']: item['count'] for item in documents_by_state}

    sync_enabled_count = Document.objects.filter(sync_enabled=True).count()
    failed_documents = Document.objects.filter(failed=True).count()
    in_review_documents = Document.objects.filter(in_review=True).count()

    # === Sync Schedule Health ===
    total_schedules = SyncSchedule.objects.count()
    enabled_schedules = SyncSchedule.objects.filter(enabled=True).count()

    # Schedules that haven't run in expected time (missed runs)
    overdue_schedules = []
    for schedule in SyncSchedule.objects.filter(enabled=True):
        if schedule.next_run_at and schedule.next_run_at < now:
            overdue_schedules.append({
                'id': schedule.id,
                'name': schedule.name,
                'next_run_at': schedule.next_run_at.isoformat(),
                'overdue_by': str(now - schedule.next_run_at),
            })

    # Recent schedule runs
    recent_runs = SyncScheduleRun.objects.filter(
        started_at__gte=time_threshold
    ).select_related('schedule', 'sync_history').order_by('-started_at')[:20]

    recent_runs_data = []
    for run in recent_runs:
        recent_runs_data.append({
            'id': run.id,
            'schedule_id': run.schedule.id,
            'schedule_name': run.schedule.name,
            'sync_type': run.schedule.sync_type,
            'triggered_by': run.triggered_by,
            'started_at': run.started_at.isoformat(),
            'completed_at': run.completed_at.isoformat() if run.completed_at else None,
            'status': run.sync_history.status if run.sync_history else 'unknown',
            'success': run.sync_history.success if run.sync_history else False,
            'records_synced': run.sync_history.records_synced if run.sync_history else 0,
            'error_message': run.sync_history.error_message if run.sync_history else None,
        })

    # Success/failure rate in time range
    runs_in_range = SyncScheduleRun.objects.filter(
        started_at__gte=time_threshold,
        sync_history__isnull=False,
    ).select_related('sync_history')

    total_runs = runs_in_range.count()
    successful_runs = runs_in_range.filter(sync_history__success=True).count()
    failed_runs = runs_in_range.filter(sync_history__success=False).count()
    success_rate = (successful_runs / total_runs * 100) if total_runs > 0 else 0

    # Upcoming scheduled runs
    upcoming_runs = SyncSchedule.objects.filter(
        enabled=True,
        next_run_at__isnull=False,
        next_run_at__gte=now,
    ).order_by('next_run_at')[:5]

    upcoming_runs_data = [{
        'id': s.id,
        'name': s.name,
        'sync_type': s.sync_type,
        'next_run_at': s.next_run_at.isoformat(),
        'collection_name': s.collection.name if s.collection else None,
        'plugin_instance_name': s.plugin_instance.name if s.plugin_instance else None,
    } for s in upcoming_runs]

    # === Plugin Health ===
    installed_plugins = Plugin.objects.filter(enabled=True).count()
    total_plugins = Plugin.objects.count()
    active_instances = PluginInstance.objects.filter(
        enabled=True,
        component__plugin__enabled=True,
    ).count()

    # Recent plugin execution failures
    recent_plugin_failures = PluginExecutionLog.objects.filter(
        started_at__gte=time_threshold,
        status=PluginExecutionLog.STATUS_FAILED,
    ).select_related('instance', 'instance__component').order_by('-started_at')[:10]

    plugin_failures_data = [{
        'id': log.id,
        'instance_name': log.instance.name,
        'component_name': log.instance.component.name,
        'started_at': log.started_at.isoformat(),
        'error_message': log.error_message[:200] if log.error_message else None,
    } for log in recent_plugin_failures]

    # Plugin execution stats in time range
    plugin_logs_in_range = PluginExecutionLog.objects.filter(started_at__gte=time_threshold)
    total_executions = plugin_logs_in_range.count()
    successful_executions = plugin_logs_in_range.filter(status=PluginExecutionLog.STATUS_SUCCESS).count()
    failed_executions = plugin_logs_in_range.filter(status=PluginExecutionLog.STATUS_FAILED).count()

    # === Collection Statistics ===
    total_collections = Collection.objects.count()
    collections_with_documents = Collection.objects.annotate(
        doc_count=Count('documents')
    ).filter(doc_count__gt=0).count()

    # === System Alerts ===
    alerts = []

    # Alert: Overdue schedules
    if overdue_schedules:
        alerts.append({
            'level': 'warning',
            'type': 'overdue_schedules',
            'message': f'{len(overdue_schedules)} schedule(s) are overdue',
            'count': len(overdue_schedules),
        })

    # Alert: Recent sync failures
    if failed_runs > 0:
        alerts.append({
            'level': 'error' if failed_runs > successful_runs else 'warning',
            'type': 'sync_failures',
            'message': f'{failed_runs} sync failure(s) in the last {days} day(s)',
            'count': failed_runs,
        })

    # Alert: Failed documents
    if failed_documents > 0:
        alerts.append({
            'level': 'warning',
            'type': 'failed_documents',
            'message': f'{failed_documents} document(s) in failed state',
            'count': failed_documents,
        })

    # Alert: Plugin failures
    if failed_executions > 0:
        alerts.append({
            'level': 'warning',
            'type': 'plugin_failures',
            'message': f'{failed_executions} plugin execution failure(s) in the last {days} day(s)',
            'count': failed_executions,
        })

    # Alert: No enabled schedules
    if enabled_schedules == 0 and total_schedules > 0:
        alerts.append({
            'level': 'info',
            'type': 'no_enabled_schedules',
            'message': 'No sync schedules are enabled',
            'count': 0,
        })

    return Response({
        'time_range': {
            'days': days,
            'from': time_threshold.isoformat(),
            'to': now.isoformat(),
        },
        'documents': {
            'total': total_documents,
            'by_state': state_counts,
            'sync_enabled': sync_enabled_count,
            'failed': failed_documents,
            'in_review': in_review_documents,
        },
        'sync_schedules': {
            'total': total_schedules,
            'enabled': enabled_schedules,
            'overdue': overdue_schedules,
            'upcoming': upcoming_runs_data,
        },
        'sync_runs': {
            'total': total_runs,
            'successful': successful_runs,
            'failed': failed_runs,
            'success_rate': round(success_rate, 1),
            'recent': recent_runs_data,
        },
        'plugins': {
            'installed': installed_plugins,
            'total': total_plugins,
            'active_instances': active_instances,
            'executions': {
                'total': total_executions,
                'successful': successful_executions,
                'failed': failed_executions,
            },
            'recent_failures': plugin_failures_data,
        },
        'collections': {
            'total': total_collections,
            'with_documents': collections_with_documents,
        },
        'alerts': alerts,
    })
