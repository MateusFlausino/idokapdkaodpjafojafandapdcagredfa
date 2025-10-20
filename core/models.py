from django.db import models
from django.contrib.auth.models import User
from django.db import models
from django.utils.text import slugify

class Client(models.Model):
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=160, unique=True)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


ROLE_CHOICES = (
    ("ADMIN", "Admin"),
    ("CLIENT", "ClientUser"),
)

class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default="CLIENT")
    # Se for usuário do cliente, amarramos aqui:
    client = models.ForeignKey(Client, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"

# --- NOVO: modelo de Tag
class Tag(models.Model):
    name = models.CharField(max_length=50, unique=True)
    color = models.CharField(max_length=7, default="#0ea5e9")  # hex, ex: #FF0000
    icon = models.CharField(max_length=50, blank=True, default="")  # opcional
    def __str__(self):
        return self.name

    
class Plant(models.Model):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="plants")
    name = models.CharField(max_length=150)
    latitude = models.FloatField()
    longitude = models.FloatField()
    tags = models.ManyToManyField('Tag', blank=True, related_name='plants')
    aps_urn = models.CharField(max_length=255, blank=True, null=True)
    address = models.CharField(max_length=255, blank=True, default="")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    slug = models.SlugField(unique=True, null=True, blank=True)
    def __str__(self):
        return f"{self.name} / {self.client.name}"


class MqttConfig(models.Model):
    """
    Configuração MQTT por planta.
    topics: lista de objetos { "topic": "tele/.../ENERGY/V", "label": "Tensão" }
    """
    plant = models.OneToOneField(Plant, on_delete=models.CASCADE, related_name="mqtt")
    broker = models.CharField(max_length=255, help_text="ex: 74.63.254.231")
    port = models.IntegerField(default=1883)
    username = models.CharField(max_length=128, blank=True, null=True)
    password = models.CharField(max_length=128, blank=True, null=True)
    client_id = models.CharField(max_length=64, blank=True, null=True)
    topics = models.JSONField(default=list, help_text="[{topic,label}, ...]")
    
    def __str__(self):
        return f"MQTT {self.plant.name}@{self.broker}:{self.port}"
  
class Measurement(models.Model):
    plant   = models.ForeignKey(Plant, on_delete=models.CASCADE)
    metric  = models.CharField(max_length=10)  # ex: V, C, PA
    value   = models.FloatField()
    ts      = models.DateTimeField(db_index=True)

    class Meta:
        indexes = [models.Index(fields=["plant", "metric", "ts"])]
        ordering = ["-ts"]

