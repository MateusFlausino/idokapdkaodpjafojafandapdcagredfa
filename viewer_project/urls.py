from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from core import views as core_views

urlpatterns = [
    path("admin/", admin.site.urls),

    # JWT Auth
    path("api/auth/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    # APIs
    path("api/", include("core.urls")),

    # Páginas HTML (viewerapp)
    path("", include("viewerapp.urls")),
    path("viewer/", core_views.viewer, name="viewer"),
    # Redirecionar / → /login/
    path("", RedirectView.as_view(url="/login/", permanent=False)),
]
