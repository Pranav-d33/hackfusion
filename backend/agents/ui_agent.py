"""
UI Execution Agent — Stateless Whitelist Validator.

This agent is strictly an execution boundary.
It validates structured UI action requests from the Orchestrator.

Rules:
  - Receives a `requested_action` string.
  - If it matches the whitelist → returns it.
  - If not → returns "none".
  - Never invents actions, never provides text, never reasons.
  - Never mutates session state.
"""

from __future__ import annotations
from typing import Dict, Any


# ── Strict whitelist of allowed UI actions ──────────────────────────────
ALLOWED_UI_ACTIONS = frozenset([
    "open_cart",
    "open_my_orders",
    "close_modal",
    "open_upload_prescription",
    "trigger_prescription_upload",
    "trigger_prescription_update",
    "open_trace",
])


def validate_ui_action(requested_action: str) -> Dict[str, Any]:
    """
    Validate a requested UI action against the whitelist.

    Args:
        requested_action: The action string to validate.

    Returns:
        {"action": "<valid_action>"} if whitelisted,
        {"action": "none"} otherwise.
    """
    if not isinstance(requested_action, str):
        return {"action": "none"}

    cleaned = requested_action.strip().lower()

    if cleaned in ALLOWED_UI_ACTIONS:
        return {"action": cleaned}

    return {"action": "none"}
