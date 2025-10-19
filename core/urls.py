from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views, views_mqtt, views_aps, views_reports

router = DefaultRouter()
router.register(r'clients', views.ClientViewSet, basename='client')
router.register(r'plants', views.PlantViewSet, basename='plant')

urlpatterns = router.urls + [
    path('', include(router.urls)),
    path("plants/<int:pk>/mqtt/latest/", views_mqtt.latest, name="mqtt-latest"),
    path("me/", views.me, name="me"),
    path("aps/token/", views_aps.aps_token, name="aps-token"),
    path("api/reports/<slug:plant_slug>/", views.reports, name="reports"),
]
