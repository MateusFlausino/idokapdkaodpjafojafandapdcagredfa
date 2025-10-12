import json, threading, time
from typing import Dict, Tuple
import logging
import paho.mqtt.client as mqtt

from .models import MqttConfig

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

# Estado em memória
PLANT_DATA: Dict[int, dict] = {}   # {plant_id: {"values": {...}, "ts": epoch}}
TOPIC_MAP: Dict[str, Tuple[int, str, str]] = {}  # topic -> (plant_id, label, field)

_start_lock = threading.Lock()
_clients_started = False

def _to_number(val):
    if val is None:
        return None
    s = str(val).strip().replace(",", ".")
    try:
        return float(s)
    except Exception:
        return None

def _on_connect(client, userdata, flags, rc):
    cfg = userdata.get("cfg")
    if rc == 0:
        logger.info(f"✅ Conectado ao broker MQTT: {cfg.broker}:{cfg.port}")
        for t in (cfg.topics or []):
            logger.info(f"   ↳ Assinando tópico: {t.get('topic')}")
    else:
        logger.error(f"❌ Falha ao conectar ao broker MQTT (rc={rc})")

def _on_message(client, userdata, msg):
    topic = msg.topic
    payload_raw = msg.payload.decode(errors="ignore")
    logger.info(f"📩 {topic} → {payload_raw}")

    mapping = TOPIC_MAP.get(topic)
    if not mapping:
        return

    plant_id, label, field = mapping
    val = None

    # tenta número direto
    n = _to_number(payload_raw)
    if n is not None:
        val = n
    else:
        # tenta JSON e extrair field (ex.: ENERGY.Voltage)
        try:
            data = json.loads(payload_raw)
            cur = data
            if field:
                for part in field.split("."):
                    if isinstance(cur, dict) and part in cur:
                        cur = cur[part]
                    else:
                        cur = None
                        break
                if cur is not None:
                    n2 = _to_number(cur)
                    val = n2 if n2 is not None else cur
            else:
                val = data
        except Exception:
            val = payload_raw

    if val is None:
        return

    entry = PLANT_DATA.get(plant_id) or {"values": {}, "ts": 0}
    entry["values"][label] = val
    entry["ts"] = int(time.time())
    PLANT_DATA[plant_id] = entry
    logger.info(f"🧩 Atualizando PLANT_DATA: plant_id={plant_id} label={label} val={val}")

def _build_maps():
    TOPIC_MAP.clear()
    for cfg in MqttConfig.objects.select_related("plant").all():
        for item in (cfg.topics or []):
            t = (item.get("topic") or "").strip()
            lbl = (item.get("label") or t).strip()
            fld = item.get("field") or None
            if t:
                TOPIC_MAP[t] = (cfg.plant_id, lbl, fld)

def _start_one(cfg: MqttConfig):
    client = mqtt.Client()
    client.user_data_set({"cfg": cfg})
    client.on_connect = _on_connect
    client.on_message = _on_message
    if cfg.username:
        client.username_pw_set(cfg.username, cfg.password or None)
    client.connect(cfg.broker, cfg.port or 1883, keepalive=60)
    for item in (cfg.topics or []):
        t = (item.get("topic") or "").strip()
        if t:
            client.subscribe(t)
    client.loop_start()

def start_all_clients():
    global _clients_started
    with _start_lock:
        if _clients_started:
            return
        for cfg in MqttConfig.objects.select_related("plant").all():
            try:
                _start_one(cfg)
            except Exception:
                logger.exception(f"Falha ao iniciar cliente MQTT para plant_id={cfg.plant_id}")
        _build_maps()
        _clients_started = True
        logger.info("🚀 Inicialização MQTT concluída — todos os clientes foram iniciados.")
