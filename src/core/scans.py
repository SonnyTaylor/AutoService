"""Core logic for Scans workflows.

This module keeps simple state for the selected service option and exposes
minimal helpers used by the UI. Expand here with real scan orchestration later.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class ScanSession:
    """Represents a scan session payload that can be passed to the next screen."""

    option: str
    started_at: str


class ScansManager:
    """Holds selection state and prepares a session for the next screen."""

    def __init__(self) -> None:
        self._selected_option: Optional[str] = None

    def select_option(self, option: str) -> None:
        self._selected_option = option

    def get_selected_option(self) -> Optional[str]:
        return self._selected_option

    def can_start(self) -> bool:
        return bool(self._selected_option)

    def start(self) -> ScanSession:
        if not self._selected_option:
            raise ValueError("No scan option selected")
        return ScanSession(
            option=self._selected_option, started_at=datetime.now().isoformat()
        )
