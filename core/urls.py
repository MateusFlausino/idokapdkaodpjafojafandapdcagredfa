from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views, views_mqtt, views_aps, views_reports

router = DefaultRouter()
router.register(r'clients', views.ClientViewSet, basename='client')
router.register(r'plants', views.PlantViewSet, basename='plant')

urlpatterns = [
    path('', include(router.urls)),

    path("plants/<int:pk>/mqtt/latest/", views_mqtt.latest, name="mqtt-latest"),
    path("me/", views.me, name="me"),
    path("aps/token/", views_aps.aps_token, name="aps-token"),

    # ✅ sem "api/" aqui (o prefixo vem do include na raiz)
    path("reports/<slug:plant_slug>/", views_reports.reports, name="reports"),
    path("reports/by-id/<int:plant_id>/", views_reports.reports_by_id, name="reports-by-id"),
]
