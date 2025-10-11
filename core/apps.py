from django.apps import AppConfig
import logging

class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        from .mqtt_runtime import start_all_clients
        try:
            start_all_clients()
        except Exception:
            logging.getLogger(__name__).exception("Falha ao iniciar MQTT")
