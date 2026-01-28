# viewer_project/urls.py
from django.contrib import admin
from django.urls import path, include
from core import views as core_views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.views.generic import RedirectView  # <--- 1. ADICIONA ESTA IMPORTAÇÃO

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    
    # Se a pasta viewerapp estiver vazia ou com problemas, comenta a linha abaixo:
    # path('', include('viewerapp.urls')), 

    # --- 2. ADICIONA ESTA LINHA (REDIRECIONAMENTO) ---
    # Isto diz: "Se o utilizador entrar na raiz, envia-o para /login/"
    path('', RedirectView.as_view(url='/login/', permanent=False)), 
    # -------------------------------------------------

    # Login page
    path("login/", core_views.login_page, name="login"),

    # JWT "oficial"
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # Alias "legado"
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair_legacy"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh_legacy"),

    # Viewer
    path("viewer/", core_views.viewer, name="viewer"),
]