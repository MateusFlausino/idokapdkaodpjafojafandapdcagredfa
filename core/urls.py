from django.urls import path
from rest_framework.routers import DefaultRouter
from . import views
from . import views_mqtt

# Cria o router do DRF
router = DefaultRouter()
router.register(r'clients', views.ClientViewSet, basename='client')
router.register(r'plants', views.PlantViewSet, basename='plant')

# Inclui as rotas automáticas dos ViewSets + rota MQTT
urlpatterns = router.urls + [
    path("plants/<int:pk>/mqtt/latest/", views_mqtt.latest, name="mqtt-latest"),
    path("me/", views.me, name="me"),
]
