from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        profile = getattr(request.user, "profile", None)
        return bool(request.user and request.user.is_authenticated and profile and profile.role == "ADMIN")

class IsAdminOrReadOwnClient(BasePermission):
    """
    - ADMIN: acesso total
    - CLIENT: GET apenas dos objetos do seu client; POST/PUT/DELETE negados
    """
    def has_permission(self, request, view):
        profile = getattr(request.user, "profile", None)
        if not (request.user and request.user.is_authenticated and profile):
            return False
        if profile.role == "ADMIN":
            return True
        # CLIENT só leitura
        return request.method in SAFE_METHODS

    def has_object_permission(self, request, view, obj):
        profile = getattr(request.user, "profile", None)
        if profile.role == "ADMIN":
            return True
        # CLIENT só pode ver se for do seu próprio client
        owner_client = getattr(obj, "client", None) or obj
        return request.method in SAFE_METHODS and profile.client_id == owner_client.id
