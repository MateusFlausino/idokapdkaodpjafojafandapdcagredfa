from django.contrib import admin
from .models import Client, Plant, UserProfile, MqttConfig
from .models import Tag
from .models import PlantIcon

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

@admin.register(PlantIcon)
class PlantIconAdmin(admin.ModelAdmin):
    list_display  = ("plant", "dbid", "key", "topic", "field_path", "label_template", "css", "is_active", "sort_order")
    list_filter   = ("is_active", "plant")
    search_fields = ("plant__name", "dbid", "key", "topic", "field_path", "label_template", "css")
    list_editable = ("is_active", "sort_order", "label_template", "css")

@admin.register(MqttConfig)
class MqttConfigAdmin(admin.ModelAdmin):
    list_display = ("plant", "broker", "port")
    search_fields = ("plant__name", "broker")

admin.site.unregister(Plant)
admin.site.register(Plant, PlantAdmin)