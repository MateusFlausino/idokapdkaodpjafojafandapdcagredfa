# viewer_project/core/views_aps.py
import os, requests, logging
from django.http import JsonResponse
from django.conf import settings

logger = logging.getLogger(__name__)

APS_TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token"
APS_DEFAULT_SCOPE = "data:read viewables:read"

def aps_token(request):
    """
    Retorna {access_token, expires_in} do APS (OAuth client_credentials).
    Usa credenciais de settings ou variáveis de ambiente.
    """
    client_id = getattr(settings, "APS_CLIENT_ID", None) or os.getenv("APS_CLIENT_ID")
    client_secret = getattr(settings, "APS_CLIENT_SECRET", None) or os.getenv("APS_CLIENT_SECRET")
    scope = getattr(settings, "APS_SCOPE", APS_DEFAULT_SCOPE)

    if not client_id or not client_secret:
        msg = "APS_CLIENT_ID/APS_CLIENT_SECRET não configurados."
        logger.error(msg)
        return JsonResponse({"error": msg}, status=500)

    try:
        r = requests.post(
            APS_TOKEN_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": client_id,
                "client_secret": client_secret,
                "scope": scope,
            },
            timeout=10,
        )
        if not r.ok:
            logger.error("APS token HTTP %s: %s", r.status_code, r.text)
            return JsonResponse({"error": "APS auth falhou", "detail": r.text}, status=502)

        j = r.json()
        return JsonResponse({"access_token": j["access_token"], "expires_in": j["expires_in"]})
    except requests.RequestException as e:
        logger.exception("Erro de rede ao pedir token APS")
        return JsonResponse({"error": "Erro de rede ao pedir token APS"}, status=502)
