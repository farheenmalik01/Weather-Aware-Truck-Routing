from django.urls import path

from routing.views import AnalyzeView, GeocodeView, HealthView

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("geocode/", GeocodeView.as_view(), name="geocode"),
    path("routes/analyze/", AnalyzeView.as_view(), name="analyze"),
]
