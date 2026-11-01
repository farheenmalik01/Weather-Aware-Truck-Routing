"""HTTP adapters. Business rules live in routing.services."""

from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import APIView

from routing.domain import Place
from routing.exceptions import AppError
from routing.serializers import AnalyzeSerializer
from routing.services.analysis import analyze
from routing.services.geocoding import geocode


class HealthView(APIView):
    def get(self, request):
        return Response({"status": "ok"})


class GeocodeView(APIView):
    def get(self, request):
        query = (request.query_params.get("q") or "").strip()
        if len(query) < 2:
            raise AppError("Enter at least 2 characters to search.", code="VALIDATION_ERROR")
        if len(query) > 120:
            raise AppError("Search text is too long.", code="VALIDATION_ERROR")
        return Response({"results": [place.to_dict() for place in geocode(query)]})


class AnalyzeView(APIView):
    def post(self, request):
        serializer = AnalyzeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = analyze(
            origin=Place(**data["origin"]),
            destination=Place(**data["destination"]),
            departure=data["departure"],
            load_lb=float(data["load_lb"]),
            sample_interval_miles=int(data["sample_interval_miles"]),
        )
        return Response(result.to_dict())
