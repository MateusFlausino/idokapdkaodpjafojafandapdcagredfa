# viewerapp/views.py
import requests
from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt

AUTH_URL = "https://developer.api.autodesk.com/authentication/v2/token"

APS_URN = (
    "dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6OGRhZXl6aHM1dHhrMXdiZ3JneGM1eWM3cWxsdGF4NmstYmFzaWMtYXBwL0NBQklORV9QQURSJUMzJTgzT19DRU1JR19QT1NUT180LlNURVA"
)

@csrf_exempt
def aps_token(request):
    client_id = getattr(settings, "APS_CLIENT_ID", "")
    client_secret = getattr(settings, "APS_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        return JsonResponse({"error": "APS_CLIENT_ID/APS_CLIENT_SECRET não configurados"}, status=500)

    data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "data:read bucket:read viewables:read",
    }
    try:
        resp = requests.post(AUTH_URL, data=data, timeout=15)
        if resp.status_code != 200:
            return JsonResponse({"error": "Auth falhou", "body": resp.text}, status=resp.status_code)
        payload = resp.json()
        return JsonResponse({
            "access_token": payload.get("access_token"),
            "expires_in": payload.get("expires_in", 3599),
        })
    except requests.RequestException as e:
        return JsonResponse({"error": f"Exceção no auth: {e}"}, status=500)

def viewer_page(request):
    return render(request, "viewer.html", {"APS_URN": APS_URN})
