# core/apps.py
from django.apps import AppConfig
import logging

class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        from django.core.signals import request_started
        from .mqtt_runtime import start_all_clients

        def _lazy_start(*args, **kwargs):
            try:
                start_all_clients()
            except Exception:
                logging.getLogger(__name__).exception("Falha ao iniciar MQTT")

        # inicia uma vez, no primeiro request
        request_started.connect(_lazy_start, dispatch_uid="core.mqtt.lazy.start")
