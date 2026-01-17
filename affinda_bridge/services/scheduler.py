"""
Service for managing sync schedules.
Provides functions for checking and running due schedules.
"""

import logging
from datetime import datetime
from typing import Optional

from django.utils import timezone

logger = logging.getLogger(__name__)


def calculate_next_run(cron_expression: str, from_time: Optional[datetime] = None) -> Optional[datetime]:
    """
    Calculate the next run time based on a cron expression.

    Args:
        cron_expression: Standard cron expression (e.g., "0 2 * * *")
        from_time: Base time to calculate from (defaults to now)

    Returns:
        The next scheduled run time, or None if parsing failed
    """
    try:
        from croniter import croniter

        base_time = from_time or timezone.now()
        cron = croniter(cron_expression, base_time)
        return cron.get_next(datetime)
    except ImportError:
        logger.error("croniter library not installed. Run: pip install croniter")
        return None
    except Exception as e:
        logger.error(f"Failed to parse cron expression '{cron_expression}': {e}")
        return None


def check_and_run_due_schedules() -> int:
    """
    Check all enabled schedules and run any that are due.

    Returns:
        Number of schedules executed
    """
    from affinda_bridge.models import SyncSchedule

    executed_count = 0
    now = timezone.now()

    # Get all enabled schedules that are due
    due_schedules = SyncSchedule.objects.filter(
        enabled=True,
        next_run_at__lte=now,
    )

    logger.info(f"Found {due_schedules.count()} due schedules")

    for schedule in due_schedules:
        try:
            logger.info(f"Running schedule: {schedule.name}")
            run_schedule(schedule, triggered_by="scheduled")
            executed_count += 1
        except Exception as e:
            logger.exception(f"Failed to run schedule {schedule.name}: {e}")

    return executed_count


def run_schedule(schedule, triggered_by: str = "scheduled") -> Optional["SyncHistory"]:
    """
    Execute a single sync schedule.

    Args:
        schedule: The SyncSchedule instance to run
        triggered_by: Either "scheduled" or "manual"

    Returns:
        The SyncHistory record created for this run
    """
    from affinda_bridge.models import SyncHistory, SyncSchedule, SyncScheduleRun
    from affinda_bridge.services.document_sync import (
        full_collection_sync,
        selective_document_sync,
    )

    logger.info(f"Executing schedule '{schedule.name}' (triggered by: {triggered_by})")

    # Determine sync type for history
    if schedule.sync_type == SyncSchedule.SYNC_TYPE_FULL_COLLECTION:
        sync_type = SyncHistory.SYNC_TYPE_FULL_COLLECTION
    else:
        sync_type = SyncHistory.SYNC_TYPE_SELECTIVE

    # Create sync history record
    sync_history = SyncHistory.objects.create(
        sync_type=sync_type,
        status=SyncHistory.STATUS_PENDING,
        collection=schedule.collection,
    )

    # Create schedule run record
    schedule_run = SyncScheduleRun.objects.create(
        schedule=schedule,
        sync_history=sync_history,
        triggered_by=triggered_by,
    )

    try:
        # Run the appropriate sync
        if schedule.sync_type == SyncSchedule.SYNC_TYPE_FULL_COLLECTION:
            if not schedule.collection:
                raise ValueError("Full collection sync requires a collection")
            full_collection_sync(schedule.collection, sync_history)
        else:
            # Selective sync
            collection_id = schedule.collection.id if schedule.collection else None
            selective_document_sync(sync_history, collection_id=collection_id)

        # Update schedule timestamps
        schedule.last_run_at = timezone.now()
        schedule.calculate_next_run()
        schedule.save(update_fields=["last_run_at", "next_run_at"])

        # Update schedule run
        schedule_run.completed_at = timezone.now()
        schedule_run.save(update_fields=["completed_at"])

        logger.info(f"Schedule '{schedule.name}' completed successfully")

    except Exception as e:
        logger.exception(f"Schedule '{schedule.name}' failed: {e}")

        # Update sync history with error
        sync_history.status = SyncHistory.STATUS_FAILED
        sync_history.success = False
        sync_history.error_message = str(e)
        sync_history.completed_at = timezone.now()
        sync_history.save()

        # Still update schedule timestamps
        schedule.last_run_at = timezone.now()
        schedule.calculate_next_run()
        schedule.save(update_fields=["last_run_at", "next_run_at"])

        schedule_run.completed_at = timezone.now()
        schedule_run.save(update_fields=["completed_at"])

    return sync_history


def get_cron_description(cron_expression: str) -> str:
    """
    Get a human-readable description of a cron expression.

    Args:
        cron_expression: Standard cron expression

    Returns:
        Human-readable description
    """
    # Common presets with descriptions
    presets = {
        "0 * * * *": "Every hour",
        "*/30 * * * *": "Every 30 minutes",
        "0 */2 * * *": "Every 2 hours",
        "0 */6 * * *": "Every 6 hours",
        "0 */12 * * *": "Every 12 hours",
        "0 0 * * *": "Daily at midnight",
        "0 2 * * *": "Daily at 2:00 AM",
        "0 6 * * *": "Daily at 6:00 AM",
        "0 0 * * 0": "Weekly on Sunday at midnight",
        "0 0 * * 1": "Weekly on Monday at midnight",
        "0 0 1 * *": "Monthly on the 1st at midnight",
    }

    if cron_expression in presets:
        return presets[cron_expression]

    # Try to parse and generate a basic description
    try:
        parts = cron_expression.split()
        if len(parts) == 5:
            minute, hour, day, month, weekday = parts

            desc_parts = []

            # Minute
            if minute == "*":
                desc_parts.append("Every minute")
            elif minute.startswith("*/"):
                desc_parts.append(f"Every {minute[2:]} minutes")
            elif minute == "0":
                pass  # Will be described with hour
            else:
                desc_parts.append(f"At minute {minute}")

            # Hour
            if hour == "*":
                if minute != "*":
                    desc_parts.append("every hour")
            elif hour.startswith("*/"):
                desc_parts.append(f"every {hour[2:]} hours")
            else:
                desc_parts.append(f"at {hour}:{minute.zfill(2)}")

            # Day of month
            if day != "*":
                desc_parts.append(f"on day {day}")

            # Month
            if month != "*":
                desc_parts.append(f"in month {month}")

            # Day of week
            weekday_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
            if weekday != "*":
                try:
                    weekday_idx = int(weekday)
                    if 0 <= weekday_idx <= 6:
                        desc_parts.append(f"on {weekday_names[weekday_idx]}")
                except ValueError:
                    desc_parts.append(f"on weekday {weekday}")

            return " ".join(desc_parts) if desc_parts else cron_expression
    except Exception:
        pass

    return cron_expression
