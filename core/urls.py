from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views_mqtt import PlantMqttLatest, PlantMqttStream
from .views import ClientViewSet, PlantViewSet, me
from .views_aps import aps_token

router = DefaultRouter()
router.register(r"clients", ClientViewSet, basename="client")
router.register(r"plants", PlantViewSet, basename="plant")

urlpatterns = [
    path("me/", me),
    path("aps/token/", aps_token),   # ← ESTA ROTA
    path("", include(router.urls)),
    path("plants/<int:plant_id>/mqtt/latest/", PlantMqttLatest.as_view()),
    path("plants/<int:plant_id>/mqtt/stream/", PlantMqttStream.as_view()),
]
