from django.http import JsonResponse
from .mqtt_runtime import PLANT_DATA

def latest(request, pk: int):
    data = PLANT_DATA.get(pk) or {"values": {}, "ts": 0}
    return JsonResponse(data)
