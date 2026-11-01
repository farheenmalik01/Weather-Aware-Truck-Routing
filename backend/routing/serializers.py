from rest_framework import serializers

from routing.services.geo import haversine_m


class PlaceSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=240)
    lat = serializers.FloatField(min_value=-90, max_value=90)
    lon = serializers.FloatField(min_value=-180, max_value=180)


class AnalyzeSerializer(serializers.Serializer):
    origin = PlaceSerializer()
    destination = PlaceSerializer()
    departure = serializers.DateTimeField()
    load_lb = serializers.FloatField(min_value=0, max_value=200_000)
    sample_interval_miles = serializers.IntegerField()

    def validate_sample_interval_miles(self, value: int) -> int:
        if value not in {10, 25, 50}:
            raise serializers.ValidationError("Sample interval must be 10, 25, or 50 miles.")
        return value

    def validate(self, attrs):
        origin = attrs["origin"]
        destination = attrs["destination"]
        meters = haversine_m(origin["lon"], origin["lat"], destination["lon"], destination["lat"])
        if meters < 800:
            raise serializers.ValidationError("Origin and destination are too close to compare routes.")
        return attrs
