from django.http import JsonResponse
from django.utils.dateparse import parse_datetime
from .models import Plant, Measurement
from datetime import timedelta

def _parse_opt_dt(s):
    # Aceita None / "" sem estourar
    return parse_datetime(s) if isinstance(s, str) and s.strip() else None

def reports(request, plant_slug):
    """
    Retorna séries históricas (Tensão V, Corrente C, Potência Ativa PA).
    Aceita ?start= e ?end= em ISO 8601; se não vierem, usa últimas 24h.
    """
    plant = Plant.objects.filter(slug=plant_slug).first()
    if not plant:
        return JsonResponse({"error": "Planta não encontrada"}, status=404)

    start = _parse_opt_dt(request.GET.get("start"))
    end   = _parse_opt_dt(request.GET.get("end"))

    # janela padrão: últimas 24h
    if not end:
        end = timezone.now()
    if not start:
        start = end - timedelta(hours=24)

    qs = (Measurement.objects
          .filter(plant=plant, ts__gte=start, ts__lte=end)
          .order_by("ts")
          .values("ts", "metric", "value"))

    data = {}
    for row in qs:
        m = row["metric"]
        data.setdefault(m, []).append([row["ts"].isoformat(), row["value"]])

    return JsonResponse(data)

def reports_by_id(request, plant_id):
    plant = Plant.objects.filter(pk=plant_id).first()
    if not plant: return JsonResponse({"error":"Planta não encontrada"}, status=404)
    # Reaproveita a view principal
    request.GET = request.GET.copy()
    return reports(request, plant.slug)