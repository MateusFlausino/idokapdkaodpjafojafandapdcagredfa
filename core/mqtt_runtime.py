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
            if t:
                TOPIC_MAP[t] = (cfg.plant_id, lbl)

def _on_connect(client, userdata, flags, rc, properties=None):
    # Inscreve-se apenas nos tópicos mapeados
    for topic in TOPIC_MAP.keys():
        client.subscribe(topic, qos=0)

def _on_message(client, userdata, msg):
    topic = msg.topic
    payload = msg.payload.decode(errors="ignore")
    plant_id, label = TOPIC_MAP.get(topic, (None, None))
    if plant_id is None:
        return
    # tenta float; se falhar guarda texto
    try:
        val = float(payload)
    except Exception:
        try:
            val = json.loads(payload)
        except Exception:
            val = payload

    data = PLANT_DATA.setdefault(plant_id, {"values": {}, "ts": 0})
    data["values"][label] = val
    data["ts"] = int(time.time())

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
