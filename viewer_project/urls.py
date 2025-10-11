from django.contrib import admin
from django.urls import path, include
from core import views as core_views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),

    # Login page
    path("login/", core_views.login_page, name="login"),

    # JWT "oficial"
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # ✅ Alias "legado" para compatibilidade com o front atual
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair_legacy"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh_legacy"),

    # Viewer
    path("viewer/", core_views.viewer, name="viewer"),
]
