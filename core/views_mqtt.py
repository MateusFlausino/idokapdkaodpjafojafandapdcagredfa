# core/views_mqtt.py
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import PlantIcon
from .serializers import PlantIconSerializer

from django.http import JsonResponse
from .mqtt_runtime import PLANT_DATA

def latest(request, pk: int):
    data = PLANT_DATA.get(pk) or {"values": {}, "ts": 0}
    return JsonResponse(data)

class PlantIconList(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk: int):
        qs = PlantIcon.objects.filter(plant_id=pk, is_active=True).order_by("sort_order", "id")
        data = PlantIconSerializer(qs, many=True).data
        return Response(data)