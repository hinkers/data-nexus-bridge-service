"""
Management command to run the sync scheduler daemon.
Continuously checks for due schedules and executes them.
"""

import signal
import sys
import time

from django.core.management.base import BaseCommand

from affinda_bridge.services import check_and_run_due_schedules


class Command(BaseCommand):
    help = "Run the sync scheduler daemon that executes due sync schedules"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.running = True

    def add_arguments(self, parser):
        parser.add_argument(
            "--interval",
            type=int,
            default=60,
            help="Check interval in seconds (default: 60)",
        )
        parser.add_argument(
            "--once",
            action="store_true",
            help="Run once and exit (useful for external cron/task scheduler)",
        )

    def handle(self, *args, **options):
        interval = options["interval"]
        run_once = options["once"]

        # Set up signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._signal_handler)
        signal.signal(signal.SIGTERM, self._signal_handler)

        self.stdout.write(
            self.style.SUCCESS(
                f"Sync scheduler started (interval: {interval}s, once: {run_once})"
            )
        )

        if run_once:
            self._check_schedules()
            self.stdout.write(self.style.SUCCESS("Scheduler check completed"))
            return

        # Run continuously
        while self.running:
            try:
                self._check_schedules()
            except Exception as e:
                self.stderr.write(
                    self.style.ERROR(f"Error checking schedules: {e}")
                )

            # Sleep in small increments to allow for graceful shutdown
            for _ in range(interval):
                if not self.running:
                    break
                time.sleep(1)

        self.stdout.write(self.style.SUCCESS("Scheduler stopped gracefully"))

    def _check_schedules(self):
        """Check for and run due schedules."""
        self.stdout.write(f"Checking for due schedules...")
        executed = check_and_run_due_schedules()
        if executed > 0:
            self.stdout.write(
                self.style.SUCCESS(f"Executed {executed} schedule(s)")
            )
        else:
            self.stdout.write("No schedules due")

    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully."""
        self.stdout.write(
            self.style.WARNING(f"\nReceived signal {signum}, shutting down...")
        )
        self.running = False
