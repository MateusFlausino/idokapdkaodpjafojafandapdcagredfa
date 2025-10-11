import json, threading, time
from typing import Dict, Tuple
import paho.mqtt.client as mqtt
from django.conf import settings
from .models import MqttConfig

# Estado em memória: por planta
# PLANT_DATA[plant_id] = {"values": {label: valor}, "ts": epoch}
PLANT_DATA: Dict[int, dict] = {}
TOPIC_MAP: Dict[str, Tuple[int, str]] = {}  # topic -> (plant_id, label)

_clients_started = False
_start_lock = threading.Lock()

def _build_maps():
    TOPIC_MAP.clear()
    for cfg in MqttConfig.objects.select_related("plant").all():
        for item in cfg.topics:
            t = (item.get("topic") or "").strip()
            lbl = (item.get("label") or t).strip()
            fld = (item.get("field") or None)
            if t:
                # topic -> (plant_id, label, field)
                TOPIC_MAP[t] = (cfg.plant_id, lbl, fld)


def _on_connect(client, userdata, flags, rc, properties=None):
    # Inscreve-se apenas nos tópicos mapeados
    for topic in TOPIC_MAP.keys():
        client.subscribe(topic, qos=0)

def _on_message(client, userdata, msg):
    topic = msg.topic
    payload_raw = msg.payload.decode(errors="ignore")
    mapping = TOPIC_MAP.get(topic)
    if not mapping:
        return

    plant_id, label, field = mapping  # agora TOPIC_MAP guarda também field (pode ser None)

    val = None
    # 1) tenta número direto
    try:
        val = float(payload_raw)
    except Exception:
        # 2) tenta JSON + extração de campo
        try:
            data = json.loads(payload_raw)
            if field:
                # navega no dict por "ENERGY.Voltage"
                cur = data
                for part in field.split("."):
                    if isinstance(cur, dict) and part in cur:
                        cur = cur[part]
                    else:
                        cur = None
                        break
                val = cur
            else:
                val = data
        except Exception:
            val = payload_raw  # mantém string se nada deu

    if val is None:
        return

    entry = PLANT_DATA.get(plant_id) or {"values": {}, "ts": 0}
    entry["values"][label] = val
    entry["ts"] = int(time.time())
    PLANT_DATA[plant_id] = entry

def _start_for_config(cfg: MqttConfig):
    client = mqtt.Client(client_id=cfg.client_id or mqtt.base62(uuid=None))
    if cfg.username:
        client.username_pw_set(cfg.username, cfg.password or "")
    client.on_connect = _on_connect
    client.on_message = _on_message
    client.connect(cfg.broker, cfg.port, 60)
    client.loop_start()
    return client

def start_all_clients():
    """Inicializa um cliente por broker distinto (ou um por planta, se preferir)."""
    global _clients_started
    with _start_lock:
        if _clients_started:
            return
        _build_maps()

        # Agrupa por (broker,port,username,password) para reaproveitar cliente
        groups = {}
        for cfg in MqttConfig.objects.all():
            key = (cfg.broker, cfg.port, cfg.username or "", cfg.password or "")
            groups.setdefault(key, []).append(cfg)

        for key, cfgs in groups.items():
            # Um cliente por grupo de credenciais
            client = mqtt.Client()
            user, pwd = key[2], key[3]
            if user:
                client.username_pw_set(user, pwd)
            client.on_connect = _on_connect
            client.on_message = _on_message
            client.connect(key[0], key[1], 60)
            client.loop_start()
        _clients_started = True
