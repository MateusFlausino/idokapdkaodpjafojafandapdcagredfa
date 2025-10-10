from django.urls import path
from .views import aps_token, viewer_page

urlpatterns = [
    path('api/token', aps_token, name='get_token'),
    path('api/auth/token', aps_token, name='token_old'),  # alias
    path('', viewer_page, name='home'),
]

