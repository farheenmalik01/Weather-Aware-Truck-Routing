from django.urls import include, path, re_path

from config.frontend import frontend

urlpatterns = [
    path("api/", include("routing.urls")),
    re_path(r"^(?P<resource>.*)$", frontend),
]
