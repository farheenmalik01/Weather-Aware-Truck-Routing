"""Serve the built UI from the same origin as the API."""

from __future__ import annotations

import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, HttpRequest, HttpResponse, HttpResponseNotFound

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")


def frontend(request: HttpRequest, resource: str = "") -> HttpResponse:
    dist = _dist_root()
    if dist is None:
        return HttpResponseNotFound()
    candidate = _safe_file(dist, resource)
    if candidate is not None:
        content_type, _encoding = mimetypes.guess_type(candidate.name)
        return FileResponse(candidate.open("rb"), content_type=content_type or "application/octet-stream")
    if resource and "." in Path(resource).name:
        return HttpResponseNotFound()
    index = dist / "index.html"
    if not index.is_file():
        return HttpResponseNotFound()
    return FileResponse(index.open("rb"), content_type="text/html")


def _dist_root() -> Path | None:
    raw = getattr(settings, "FRONTEND_DIST", "")
    if not raw:
        return None
    dist = Path(raw)
    if not dist.is_dir():
        return None
    return dist.resolve()


def _safe_file(dist: Path, resource: str) -> Path | None:
    relative = Path(resource)
    if relative.is_absolute() or ".." in relative.parts:
        return None
    candidate = (dist / relative).resolve()
    try:
        candidate.relative_to(dist)
    except ValueError:
        return None
    if candidate.is_file():
        return candidate
    return None
