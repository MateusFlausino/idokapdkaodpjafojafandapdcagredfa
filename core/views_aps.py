import os, time, requests
from django.http import JsonResponse
from django.views.decorators.http import require_GET

APS_OAUTH_URL = "https://developer.api.autodesk.com/authentication/v2/token"

# cache simples em memória
_TOKEN_CACHE = {"token": None, "exp": 0}  # epoch seconds

def _env(var):
    v = os.getenv(var)
    return v.strip() if v else v

@require_GET
def aps_token(request):
    cid  = _env("APS_CLIENT_ID")
    csec = _env("APS_CLIENT_SECRET")
    if not cid or not csec:
        return JsonResponse({"error": "APS credentials missing"}, status=500)

    # se ainda válido, devolve do cache
    now = int(time.time())
    if _TOKEN_CACHE["token"] and _TOKEN_CACHE["exp"] - now > 60:
        return JsonResponse({"access_token": _TOKEN_CACHE["token"], "expires_in": _TOKEN_CACHE["exp"] - now})

    data = {"grant_type": "client_credentials", "scope": "viewables:read"}
    try:
        resp = requests.post(APS_OAUTH_URL, data=data, auth=(cid, csec), timeout=10)
    except requests.RequestException as e:
        return JsonResponse({"error": "APS request error", "detail": str(e)}, status=502)

    if not resp.ok:
        # devolve mensagem do APS p/ debug
        return JsonResponse({"error": "APS auth failed", "detail": resp.text}, status=resp.status_code)

    j = resp.json()
    _TOKEN_CACHE["token"] = j.get("access_token")
    _TOKEN_CACHE["exp"]   = now + int(j.get("expires_in", 0))
    return JsonResponse({"access_token": _TOKEN_CACHE["token"], "expires_in": _TOKEN_CACHE["exp"] - now})
