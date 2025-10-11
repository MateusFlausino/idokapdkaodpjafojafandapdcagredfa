from rest_framework import viewsets, permissions, decorators, response
from django.contrib.auth.models import User
from django.shortcuts import render

from .models import Client, Plant
from .serializers import ClientSerializer, PlantSerializer, MeSerializer
from .permissions import IsAdmin, IsAdminOrReadOwnClient

class ClientViewSet(viewsets.ModelViewSet):
    """
    Admin gerencia clientes.
    Usuário CLIENT pode apenas 'listar/detalhar' o *seu* Client (via filtro no get_queryset).
    """
    queryset = Client.objects.all().order_by("name")
    serializer_class = ClientSerializer
    permission_classes = [IsAdminOrReadOwnClient]

    def get_queryset(self):
        qs = super().get_queryset()
        profile = getattr(self.request.user, "profile", None)
        if profile and profile.role != "ADMIN" and profile.client_id:
            return qs.filter(id=profile.client_id)
        return qs

class PlantViewSet(viewsets.ModelViewSet):
    """
    Plantas: ADMIN CRUD completo; CLIENT: somente leitura, filtrado pelo seu Client.
    """
    queryset = Plant.objects.select_related("client").all().order_by("client__name", "name")
    serializer_class = PlantSerializer
    permission_classes = [IsAdminOrReadOwnClient]

    def get_queryset(self):
        qs = super().get_queryset()
        profile = getattr(self.request.user, "profile", None)
        if profile and profile.role != "ADMIN" and profile.client_id:
            qs = qs.filter(client_id=profile.client_id)

        client_id = self.request.query_params.get("client")
        if client_id:
            qs = qs.filter(client_id=client_id)

        # Filtro por tags (?tags=nome1,nome2 ou ?tags=1,3)
        tags_param = self.request.query_params.get("tags")
        if tags_param:
            parts = [p.strip() for p in tags_param.split(",") if p.strip()]
            ids = [int(p) for p in parts if p.isdigit()]
            names = [p for p in parts if not p.isdigit()]
            if ids:
                qs = qs.filter(tags__id__in=ids)
            if names:
                qs = qs.filter(tags__name__in=names)
            qs = qs.distinct()

        # só plantas ativas com lat/lng preenchidos
        return qs.filter(is_active=True)\
                 .exclude(latitude__isnull=True)\
                 .exclude(longitude__isnull=True)

    def perform_create(self, serializer):
        serializer.save()

@decorators.api_view(["GET"])
def me(request):
    return response.Response(MeSerializer(request.user).data)

def viewer(request):
    """Renderiza a página principal do mapa com os pinos das plantas"""
    return render(request, "viewer.html")

def login_page(request):
    """Página simples de login que obtém JWT e salva no localStorage."""
    return render(request, "login.html")