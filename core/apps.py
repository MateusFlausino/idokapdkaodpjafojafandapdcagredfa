from django.apps import AppConfig
import os

class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def ready(self):
        # Evita duplicar threads no autoreload
        if os.environ.get("RUN_MAIN") != "true":
            return
        from .mqtt_runtime import start_all_clients
        try:
            start_all_clients()
        except Exception as e:
            # Loga mas não derruba o servidor
            import logging
            logging.getLogger(__name__).exception("Falha ao iniciar MQTT: %s", e)