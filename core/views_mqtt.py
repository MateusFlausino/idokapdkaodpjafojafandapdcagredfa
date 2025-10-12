# viewer_project/core/views_mqtt.py
from functools import wraps
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from .mqtt_runtime import PLANT_DATA

def require_bearer(view):
    @wraps(view)
    def _wrap(request, *args, **kwargs):
        auth = request.META.get("HTTP_AUTHORIZATION", "")
        if not auth.startswith("Bearer "):
            return JsonResponse({"detail": "Unauthorized"}, status=401)
        return view(request, *args, **kwargs)
    return _wrap

@require_GET
@require_bearer
def latest(request, *args, **kwargs):
    # aceita plant_id OU pk
    pid = kwargs.get("plant_id", kwargs.get("pk"))
    try:
        pid = int(pid)
    except Exception:
        pid = None
    slot = PLANT_DATA.get(pid) or {"values": {}, "ts": 0}
    return JsonResponse(slot)