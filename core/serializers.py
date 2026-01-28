from rest_framework import serializers
from .models import Plant, Client, Tag
from .models import PlantIcon

class TagSerializer(serializers.ModelSerializer):
  class Meta:
    model = Tag
    fields = ("id", "name", "color", "icon")

class ClientSerializer(serializers.ModelSerializer):
  class Meta:
    model = Client
    fields = ("id", "name")

class PlantSerializer(serializers.ModelSerializer):
  latitude  = serializers.SerializerMethodField()
  longitude = serializers.SerializerMethodField()
  tags = TagSerializer(many=True, read_only=True)

  class Meta:
    model = Plant
    fields = ("id", "name", "client", "latitude", "longitude", "aps_urn", "address", "is_active", "tags")

  def _to_float(self, v):
    if v is None:
      return None
    s = str(v).strip().replace(",", ".")
    try:
      return float(s)
    except Exception:
      return None

  def get_latitude(self, obj):
    return self._to_float(obj.latitude)

  def get_longitude(self, obj):
    return self._to_float(obj.longitude)

class MeSerializer(serializers.Serializer):
  username = serializers.CharField()
  user = serializers.CharField(source="username")


class PlantIconSerializer(serializers.ModelSerializer):
    dbId = serializers.IntegerField(source="dbid")
    labelTemplate = serializers.CharField(source="label_template")

    class Meta:
        model = PlantIcon
        fields = ("dbId", "key", "topic", "field_path", "labelTemplate", "css")