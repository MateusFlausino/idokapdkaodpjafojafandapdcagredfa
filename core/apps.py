# viewer_project/core/apps.py
from django.apps import AppConfig
import sys, logging
from django.db import connection

logger = logging.getLogger(__name__)
_started = False

class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'core'

    def ready(self):
        global _started
        # NÃO iniciar em comandos de management (mas permitir runserver)
        mgmt_cmds = {
            'migrate','makemigrations','collectstatic','shell',
            'showmigrations','createsuperuser','check','test',
            'loaddata','dumpdata','dbshell'
        }
        if any(cmd in sys.argv for cmd in mgmt_cmds):
            return
        if _started:
            return
        try:
            if 'core_plant' not in connection.introspection.table_names():
                return
            from .mqtt_runtime import start_all_clients
            start_all_clients()
            _started = True
            logger.info("MQTT iniciado via AppConfig.ready()")
        except Exception:
            logger.exception("Falha ao iniciar MQTT")
