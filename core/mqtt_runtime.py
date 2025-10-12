# viewer_project/core/mqtt_runtime.py
from __future__ import annotations

import json
import logging
import time
from typing import Dict, Any

from django.db import connection, OperationalError, ProgrammingError

logger = logging.getLogger(__name__)

# Cache em memória lido pelos endpoints/JS
# Estrutura: { plant_id: {"values": {label: value, ...}, "ts": epoch_seconds } }
PLANT_DATA: Dict[int, Dict[str, Any]] = {}

_clients = []  # handlers dos clientes MQTT já conectados


# ---------- helpers de DB e parse ----------

def _db_ready() -> bool:
    """Retorna True se as tabelas do app 'core' já existem (útil durante migrações)."""
    try:
        return 'core_plant' in connection.introspection.table_names()
    except Exception:
        return False


def _safe_get_mqtt_configs():
    """
    Carrega configs do banco somente quando possível.
    Deve retornar um queryset/iterável de MqttConfig.
    """
    try:
        from .models import MqttConfig  # import adiado
        # Se o modelo tiver flag 'enabled', filtre; senão, remova o filter.
        try:
            qs = MqttConfig.objects.select_related("plant").all()
        except Exception:
            qs = MqttConfig.objects.all()
        return qs
    except (OperationalError, ProgrammingError) as e:
        logger.warning("DB ainda não pronto p/ MQTT: %s", e)
        return []
    except Exception:
        logger.exception("Erro carregando MqttConfig")
        return []


def _topics_map(cfg) -> Dict[str, str]:
    """
    Tenta montar um dict {topic: label} a partir do campo JSON de tópicos da sua MqttConfig.
    Aceita formatos:
      - lista de objetos: [{"topic":"cmnd/.../POWER1","label":"Disparo na Fase A"}, ...]
      - dict simples: {"cmnd/.../POWER1": "Disparo na Fase A", ...}
    """
    raw = getattr(cfg, "topics", None) or getattr(cfg, "topics_json", None) or "[]"
    try:
        data = json.loads(raw)
    except Exception:
        return {}

    mapping = {}
    if isinstance(data, dict):
        for t, lb in data.items():
            if t and lb:
                mapping[str(t)] = str(lb)
    elif isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            t = item.get("topic") or item.get("name") or item.get("t") or ""
            lb = item.get("label") or item.get("alias") or item.get("l") or t
            if t:
                mapping[str(t)] = str(lb)
    return mapping


def _coerce_value(payload_bytes: bytes) -> Any:
    """
    Converte o payload para um valor útil:
      - JSON → mantém (se for simples)
      - "ON"/"OFF"/"TRUE"/"FALSE"/"1"/"0" → 1/0
      - número string → float
      - fallback: string
    """
    s = payload_bytes.decode("utf-8", errors="ignore").strip()

    # Tenta JSON
    if s.startswith("{") or s.startswith("["):
        try:
            return json.loads(s)
        except Exception:
            pass

    up = s.upper()
    if up in ("ON", "TRUE"):
        return 1
    if up in ("OFF", "FALSE"):
        return 0

    # número
    try:
        return float(s.replace(",", "."))
    except Exception:
        pass

    return s


def _update_latest(plant_id: int, kv: Dict[str, Any], ts: float) -> None:
    slot = PLANT_DATA.setdefault(plant_id, {"values": {}, "ts": 0})
    try:
        slot["values"].update(kv)
    except Exception:
        slot["values"] = dict(kv)
    slot["ts"] = int(ts)



# ... imports e PLANT_DATA como já está ...

def _on_message_factory(plant_id: int, topic_map: Dict[str, str]):
    def _on_message(client, userdata, msg):
        try:
            # garanta plant_id a partir do userdata (fallback)
            pid = plant_id or (userdata or {}).get("plant_id")
            if not pid:
                logger.warning("Mensagem sem plant_id. topic=%s", msg.topic)
                return

            val = _coerce_value(msg.payload)

            kv = {}
            if isinstance(val, dict):
                for subk, subv in val.items():
                    label = topic_map.get(f"{msg.topic}/{subk}") or str(subk)
                    kv[label] = subv
            else:
                label = topic_map.get(msg.topic) or msg.topic
                kv[label] = val

            if kv:
                _update_latest(int(pid), kv, time.time())
                logger.info("MQTT <- plant=%s topic=%s kv=%s", pid, msg.topic, kv)
        except Exception:
            logger.exception("Falha no on_message (topic=%s)", msg.topic)
    return _on_message


def _start_one_client(cfg):
    try:
        import paho.mqtt.client as mqtt
    except Exception:
        logger.error("paho-mqtt não instalado. pip install paho-mqtt")
        return None

    topic_map = _topics_map(cfg)
    topics = list(topic_map.keys())
    if not topics:
        logger.warning("MqttConfig id=%s sem tópicos válidos", getattr(cfg, "id", "?"))
        return None

    client_id = f"twin_{getattr(cfg, 'id', int(time.time()))}"
    # 👉 paho v1 e v2: preferir setar userdata explicitamente
    client = mqtt.Client(client_id=client_id)
    client.user_data_set({"plant_id": cfg.plant_id})

    user = getattr(cfg, "username", None) or getattr(cfg, "user", None)
    pwd  = getattr(cfg, "password", None) or getattr(cfg, "passw", None)
    if user:
        client.username_pw_set(user, pwd or "")

    client.on_message = _on_message_factory(cfg.plant_id, topic_map)

    host = getattr(cfg, "host", None) or getattr(cfg, "server", None) or "localhost"
    port = int(getattr(cfg, "port", 1883) or 1883)
    keepalive = int(getattr(cfg, "keepalive", 30) or 30)

    try:
        # reconexão gradual (evita cair)
        try:
            client.reconnect_delay_set(min_delay=1, max_delay=60)
        except Exception:
            pass
        client.connect(host, port, keepalive)
    except Exception:
        logger.exception("Falha conectando no broker MQTT (%s:%s)", host, port)
        return None

    for t in topics:
        try:
            client.subscribe(t, qos=0)
        except Exception:
            logger.exception("Falha ao assinar tópico %s (cfg id=%s)", t, getattr(cfg, "id", "?"))

    try:
        client.loop_start()
    except Exception:
        logger.exception("Falha no loop_start do cliente MQTT")
        return None

    logger.info("MQTT conectado (plant_id=%s, cfg_id=%s, host=%s, topics=%d)",
                cfg.plant_id, getattr(cfg, "id", "?"), host, len(topics))
    return client



def start_all_clients() -> None:
    if not _db_ready():
        logger.warning("DB não pronto (skip start_all_clients)")
        return

    cfgs = _safe_get_mqtt_configs()
    if not cfgs:
        logger.warning("Nenhuma MqttConfig encontrada (ou DB indisponível).")
        return

    for cfg in cfgs:
        try:
            c = _start_one_client(cfg)
            if c:
                _clients.append(c)
        except Exception:
            logger.exception("Falha iniciando cliente (cfg id=%s)", getattr(cfg, "id", "?"))


def stop_all_clients() -> None:
    """Encerra clientes MQTT com segurança."""
    for c in list(_clients):
        try:
            c.loop_stop()
        except Exception:
            pass
        try:
            c.disconnect()
        except Exception:
            pass
        try:
            _clients.remove(c)
        except Exception:
            pass
