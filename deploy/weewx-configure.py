#!/usr/bin/env python3
"""weewx 5 für die Station BG Blumenstraße einstellen.

Setzt in /etc/weewx/weewx.conf: Standort, Meteostick-Treiber, Archiv in US-Einheiten
(wie das übernommene Archiv), keine HTML-Berichte (macht die App), MQTT für Livewerte und
Weather Underground. Das Wunderground-Passwort wird abgefragt und steht nie im Repo.
Vorher wird eine Sicherung weewx.conf.<Zeit> angelegt. Mehrfach ausführbar.

    sudo python3 deploy/weewx-configure.py [--port /dev/serial/by-id/...] [--no-wunderground]
"""
import argparse
import getpass
import shutil
import time

import configobj

parser = argparse.ArgumentParser()
parser.add_argument('--conf', default='/etc/weewx/weewx.conf', help='Pfad der weewx.conf')
parser.add_argument('--port', default='/dev/ttyUSB0', help='serielle Schnittstelle des Meteostick')
parser.add_argument('--wu-station', default='IBREGENZ35', help='Weather-Underground-Stations-ID')
parser.add_argument('--no-wunderground', action='store_true', help='keine Daten an Weather Underground')
args = parser.parse_args()
CONF = args.conf

shutil.copy2(CONF, f'{CONF}.{time.strftime("%Y%m%d-%H%M%S")}')
c = configobj.ConfigObj(CONF, encoding='utf-8', interpolation=False, file_error=True)


def section(parent, name):
    if name not in parent:
        parent[name] = {}
    return parent[name]


section(c, 'Station').update({
    'location': 'BG Bregenz Blumenstraße, Bregenz',
    'latitude': '47.499074',
    'longitude': '9.740264',
    'altitude': ['434', 'meter'],
    'station_type': 'Meteostick',
    'station_url': 'https://wetter.bgblumenstrasse.at/',
    'rain_year_start': '1',
    'week_start': '0',
})

# Werte wie bisher am Raspberry Pi (Vantage Pro2 ISS auf Kanal 1, Kippwaage 0,2 mm)
section(c, 'Meteostick').update({
    'driver': 'user.meteostick',
    'port': args.port,
    'transceiver_frequency': 'EU',
    'iss_channel': '1',
    'anemometer_channel': '0',
    'leaf_soil_channel': '0',
    'temp_hum_1_channel': '0',
    'temp_hum_2_channel': '0',
    'rain_bucket_type': '1',
})

# Das übernommene Archiv ist in US-Einheiten – weewx muss so weiterschreiben
section(c, 'StdConvert')['target_unit'] = 'US'
section(c, 'StdArchive').update({'archive_interval': '300', 'record_generation': 'software'})

# Webseiten erzeugt die App, nicht weewx
for name, skin in section(c, 'StdReport').items():
    if isinstance(skin, dict) and 'skin' in skin:
        skin['enable'] = 'false'

restful = section(c, 'StdRESTful')

# Livewerte: jedes Loop-Paket an Mosquitto, Thema weather/loop, metrisch ohne Einheiten-Anhang
section(restful, 'MQTT').update({
    'enable': 'true',
    'server_url': 'mqtt://localhost:1883/',
    'topic': 'weather',
    'unit_system': 'METRIC',
    'append_units_label': 'false',
    'binding': 'loop',
})

wu = section(restful, 'Wunderground')
if args.no_wunderground:
    wu['enable'] = 'false'
else:
    password = getpass.getpass(f'Weather-Underground-Passwort (Stations-Key) für {args.wu_station}: ')
    wu.update({'enable': 'true', 'station': args.wu_station, 'rapidfire': 'false'})
    if password:
        wu['password'] = password

c.write()
print(f'{CONF} aktualisiert. Prüfen mit: sudo weectl station show  bzw.  sudo weectl debug --output /tmp/weewx-debug.txt')
