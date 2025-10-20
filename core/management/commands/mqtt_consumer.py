import json, os, datetime as dt
from django.core.management.base import BaseCommand
from django.utils import timezone
from core.models import Plant, Measurement
import paho.mqtt.client as mqtt

BROKER   = os.getenv("MQTT_HOST", "localhost")
PORT     = int(os.getenv("MQTT_PORT", "1883"))
USER     = os.getenv("MQTT_USER", "") or None
PASS     = os.getenv("MQTT_PASS", "") or None

# Mapeie tópico/campo -> métrica
# Exemplo Tasmota SENSOR (JSON) vindo em tele/<device>/SENSOR
MAP = {
    "ENERGY.Voltage": "V",   # tensão
    "ENERGY.Current": "C",   # corrente
    "ENERGY.Power":   "PA",  # potência ativa
}

# opcional: device->plant
DEVICE_TO_PLANT = {
    # "xisto_A399CE": 1,  # device -> plant_id
}

def get_plant_id_from_topic(topic):
    # Ex: tele/xisto_A399CE/SENSOR -> device = xisto_A399CE
    parts = topic.split("/")
    device = parts[1] if len(parts) > 1 else None
    if device in DEVICE_TO_PLANT:
        return DEVICE_TO_PLANT[device]
    # fallback: busque por name ou tags
    p = Plant.objects.filter(name__icontains=device).first()
    return p.id if p else None

class Command(BaseCommand):
    help = "Assina MQTT e persiste medidas em Measurement"

    def handle(self, *args, **opts):
        client = mqtt.Client()
        if USER and PASS:
            client.username_pw_set(USER, PASS)

        def on_connect(c, u, f, rc, props=None):
            self.stdout.write(self.style.SUCCESS(f"MQTT conectado rc={rc}"))
            # Assine os tópicos necessários
            c.subscribe("tele/+/SENSOR")  # ajuste para seus tópicos
            # c.subscribe("tele/+/ENERGY/V") etc. se vier em tópicos separados

        def on_message(c, u, msg):
            try:
                payload = msg.payload.decode("utf-8", "ignore")
                data = json.loads(payload) if payload.strip().startswith("{") else None
                plant_id = get_plant_id_from_topic(msg.topic)
                if not plant_id:
                    return

                ts = timezone.now()

                # Caso vindo como JSON de SENSOR (ENERGY.Voltage/Current/Power)
                if data:
                    for path, metric in MAP.items():
                        # navegação ENERGY.Voltage
                        cur = data
                        for k in path.split("."):
                            if isinstance(cur, dict) and k in cur:
                                cur = cur[k]
                            else:
                                cur = None
                                break
                        if isinstance(cur, (int, float)):
                            Measurement.objects.create(
                                plant_id=plant_id, ts=ts, metric=metric, value=float(cur)
                            )
                else:
                    # Caso o valor venha direto no tópico (ex.: tele/<dev>/ENERGY/V)
                    # Extraia a última parte do tópico como submétrica
                    last = msg.topic.rsplit("/", 1)[-1].upper()
                    metric = {"V":"V","C":"C","PA":"PA"}.get(last)
                    val = float(payload.replace(",", ".")) if metric else None
                    if metric and val is not None:
                        Measurement.objects.create(
                            plant_id=plant_id, ts=ts, metric=metric, value=val
                        )

            except Exception as e:
                self.stderr.write(f"mqtt_consumer error: {e}")

        client.on_connect = on_connect
        client.on_message = on_message
        client.connect(BROKER, PORT, keepalive=60)
        client.loop_forever()
