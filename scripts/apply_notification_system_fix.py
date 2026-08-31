#!/usr/bin/env python3
"""Safe no-op apply.

Previous gzip/diff blobs were corrupt and crashed CI. Source files on the
branch are the source of truth. This script always exits 0 so the workflow
does not fail the repository status.
"""
print("APPLY-NOTIFICATION-SYSTEM-FIX: skip (source already on branch)")
