from django.http import JsonResponse
from django.utils.dateparse import parse_datetime
from .models import Plant, Measurement

def reports(request, plant_slug):
    """Retorna séries históricas de medições MQTT para gráficos."""
    metric = request.GET.get("metric")
    start  = parse_datetime(request.GET.get("start"))
    end    = parse_datetime(request.GET.get("end"))

    plant = Plant.objects.filter(slug=plant_slug).first()
    if not plant:
        return JsonResponse({"error": "Planta não encontrada"}, status=404)

    qs = Measurement.objects.filter(plant=plant)
    if metric: qs = qs.filter(metric=metric)
    if start:  qs = qs.filter(ts__gte=start)
    if end:    qs = qs.filter(ts__lte=end)
    qs = qs.order_by("ts").values("ts","metric","value")

    data = {}
    for row in qs:
        m = row["metric"]
        data.setdefault(m, []).append([row["ts"].isoformat(), row["value"]])

    return JsonResponse(data)
