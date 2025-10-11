from django.contrib import admin
from .models import Client, Plant, UserProfile, MqttConfig
from .models import Tag

@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "created_at")
    search_fields = ("name", "slug")

@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ("name", "color", "icon")
    search_fields = ("name",)

@admin.register(Plant)
class PlantAdmin(admin.ModelAdmin):
    list_display = ("name", "client", "latitude", "longitude", "is_active")
    list_filter  = ("client", "is_active", "tags")
    filter_horizontal = ("tags",)
    search_fields = ("name", "aps_urn", "address")
@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "client")
    list_filter = ("role", "client")
    search_fields = ("user__username",)

@admin.register(MqttConfig)
class MqttConfigAdmin(admin.ModelAdmin):
    list_display = ("plant", "broker", "port")
    search_fields = ("plant__name", "broker")

admin.site.unregister(Plant)
admin.site.register(Plant, PlantAdmin)