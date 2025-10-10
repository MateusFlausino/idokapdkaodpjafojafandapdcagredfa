import json, time
from django.http import JsonResponse, StreamingHttpResponse, HttpResponseBadRequest
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from .mqtt_runtime import PLANT_DATA

class PlantMqttLatest(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, plant_id: int):
        data = PLANT_DATA.get(int(plant_id)) or {"values": {}, "ts": 0}
        return JsonResponse(data)

class PlantMqttStream(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request, plant_id: int):
        try:
            pid = int(plant_id)
        except ValueError:
            return HttpResponseBadRequest("invalid plant_id")

        def gen():
            # SSE simples (1 msg/seg)
            while True:
                payload = PLANT_DATA.get(pid) or {"values": {}, "ts": 0}
                yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
                time.sleep(1)
        resp = StreamingHttpResponse(gen(), content_type="text/event-stream")
        resp["Cache-Control"] = "no-cache"
        resp["X-Accel-Buffering"] = "no"
        return resp
