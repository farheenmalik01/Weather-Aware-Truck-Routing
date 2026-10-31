"""Application errors that map to a stable JSON shape."""

from __future__ import annotations


class AppError(Exception):
    """Expected failure with a client-facing message and status."""

    code = "BAD_REQUEST"
    status_code = 400

    def __init__(self, message: str, *, code: str | None = None, status_code: int | None = None):
        super().__init__(message)
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
