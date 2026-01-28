from django.urls import path
from .views import login_page, viewer_page 

urlpatterns = [
    path("login/", login_page, name="login_page"),
    path("viewer/", viewer_page, name="viewer_page"),
]
