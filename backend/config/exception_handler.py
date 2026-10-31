"""Stable error JSON for every API failure.

{
  "error": true,
  "code": "VALIDATION_ERROR",
  "message": "Human-readable explanation"
}
"""

from __future__ import annotations

import logging

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

from routing.exceptions import AppError

logger = logging.getLogger(__name__)

_STATUS_CODES = {
    status.HTTP_400_BAD_REQUEST: "VALIDATION_ERROR",
    status.HTTP_404_NOT_FOUND: "NOT_FOUND",
    status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
}


def custom_exception_handler(exc, context):
    if isinstance(exc, AppError):
        return Response(
            {"error": True, "code": exc.code, "message": str(exc)},
            status=exc.status_code,
        )

    response = exception_handler(exc, context)
    if response is None:
        logger.exception("Unhandled API error")
        return Response(
            {
                "error": True,
                "code": "SERVER_ERROR",
                "message": "Something went wrong while handling that request.",
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    response.data = {
        "error": True,
        "code": _STATUS_CODES.get(response.status_code, "REQUEST_FAILED"),
        "message": _message(response.data) or "The request could not be completed.",
    }
    return response


def _message(data) -> str:
    if isinstance(data, dict):
        if "detail" in data and len(data) == 1:
            return _message(data["detail"])
        parts = []
        for key, value in data.items():
            text = _message(value)
            if not text:
                continue
            if key in {"detail", "non_field_errors"}:
                parts.append(text)
            else:
                parts.append(f"{key}: {text}")
        return " ".join(parts)
    if isinstance(data, (list, tuple)):
        return " ".join(text for item in data if (text := _message(item)))
    return str(data).strip()
