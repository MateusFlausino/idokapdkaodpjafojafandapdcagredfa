from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Client, Plant, UserProfile

class ClientSerializer(serializers.ModelSerializer):
    class Meta:
        model = Client
        fields = ["id", "name", "slug", "notes", "created_at"]

class PlantSerializer(serializers.ModelSerializer):
    client_name = serializers.CharField(source="client.name", read_only=True)

    class Meta:
        model = Plant
        fields = [
            "id", "client", "client_name", "name",
            "latitude", "longitude", "aps_urn", "address",
            "is_active", "created_at"
        ]

class MeSerializer(serializers.ModelSerializer):
    role = serializers.CharField(source="profile.role", read_only=True)
    client = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name", "last_name", "role", "client"]

    def get_client(self, obj):
        p = getattr(obj, "profile", None)
        return {"id": p.client_id, "name": p.client.name} if (p and p.client) else None
