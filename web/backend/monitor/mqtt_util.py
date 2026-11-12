"""Client MQTT dari variabel lingkungan, dipakai listener (#12) dan simulator (#13)."""
import os

import paho.mqtt.client as mqtt
from django.core.management.base import CommandError


def client_dari_env(client_id, clean_session=True):
    """Kembalikan (client, host, port) sesuai MQTT_* di .env."""
    host = os.environ.get('MQTT_HOST')
    if not host:
        raise CommandError('MQTT_HOST belum diisi di .env')
    # MQTT_TRANSPORT=websockets: cadangan bila hanya HTTP dan WebSocket yang bisa lewat
    transport = os.environ.get('MQTT_TRANSPORT', 'tcp')
    if transport not in ('tcp', 'websockets'):
        raise CommandError("MQTT_TRANSPORT harus 'tcp' atau 'websockets'")
    port = int(os.environ.get('MQTT_PORT', '443' if transport == 'websockets' else '8883'))

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id,
                         clean_session=clean_session, transport=transport)
    if transport == 'websockets':
        client.ws_set_options(path=os.environ.get('MQTT_WS_PATH', '/mqtt'))
    if os.environ.get('MQTT_USER'):
        client.username_pw_set(os.environ['MQTT_USER'], os.environ.get('MQTT_PASS'))
    if os.environ.get('MQTT_TLS', '1') == '1':
        client.tls_set()  # TLS untuk MQTT (port 8883) atau wss (port 443)
    return client, host, port
