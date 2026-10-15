import json
import math
import os
import sqlite3
import threading
import time
import webbrowser
from contextlib import closing
from datetime import datetime

import serial
from serial.tools import list_ports
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

# Arduino sends one JSON object per line; every additional numeric key is
# persisted and returned as an optional sensor for automatic dashboard cards.
# The previous three-value CSV format remains supported for older sketches.

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_FOLDER = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend', 'dist'))

app = Flask(__name__, static_folder=FRONTEND_FOLDER)
CORS(app)

DB_FILE = os.path.join(BASE_DIR, "sensor_data.db")
SERIAL_PORT = os.environ.get("ARDUINO_PORT", "COM5").strip()
BAUD_RATE = 9600
SENSOR_TIMEOUT_SECONDS = 5
MAX_DISTANCE_CM = 400
API_VERSION = 6

hardware_state = {
    "connected": False,
    "last_seen": 0,
    "serial_port": None,
}


def parse_sensor_value(value):
    if value is None:
        return None

    try:
        number = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError("Sensor values must be numbers or null") from error
    if not math.isfinite(number):
        raise ValueError("Sensor values must be finite numbers or null")
    return number


def cap_distance_cm(value):
    distance = parse_sensor_value(value)
    if distance is None:
        return None
    return min(max(distance, 0), MAX_DISTANCE_CM)


def parse_sensor_line(line):
    if line.startswith("{"):
        payload = json.loads(line)
        if not isinstance(payload, dict):
            raise ValueError("JSON sensor payload must be an object")
        if not payload:
            raise ValueError("JSON sensor payload must contain at least one field")

        temperature = parse_sensor_value(payload.get("temperature"))
        humidity = parse_sensor_value(payload.get("humidity"))
        distance = cap_distance_cm(payload.get("distance"))
        known_fields = {"temperature", "humidity", "distance"}
        extra_sensors = {
            key: value
            for key, raw_value in payload.items()
            if key not in known_fields
            and (value := parse_sensor_value(raw_value)) is not None
        }
    else:
        parts = line.split(",")
        if len(parts) != 3:
            raise ValueError("Legacy sensor payload must contain 3 CSV values")

        temperature, humidity, distance = (
            parse_sensor_value(part) for part in parts
        )
        distance = cap_distance_cm(distance)
        extra_sensors = {}

    return temperature, humidity, distance, extra_sensors


def init_db():
    with closing(sqlite3.connect(DB_FILE)) as conn, conn:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                temperature REAL,
                humidity REAL,
                distance REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                extra_sensors TEXT NOT NULL DEFAULT '{}'
            )
        ''')

        columns = {
            row[1] for row in cursor.execute("PRAGMA table_info(readings)")
        }
        if "extra_sensors" not in columns:
            cursor.execute(
                "ALTER TABLE readings ADD COLUMN extra_sensors TEXT NOT NULL DEFAULT '{}'"
            )


def get_serial_candidates():
    if SERIAL_PORT and SERIAL_PORT.upper() != "AUTO":
        return [SERIAL_PORT]

    ports = list(list_ports.comports())
    preferred_tokens = (
        "arduino",
        "usb serial",
        "usb-serial",
        "ch340",
        "cp210",
        "ftdi",
        "uart",
    )

    def priority(port):
        details = " ".join(
            str(value or "")
            for value in (port.description, port.manufacturer, port.hwid)
        ).lower()
        return 0 if any(token in details for token in preferred_tokens) else 1

    return [port.device for port in sorted(ports, key=priority)]


def get_detected_serial_ports():
    return [port.device for port in list_ports.comports()]


def read_from_serial():
    ser = None
    current_port = None
    candidate_index = 0
    last_valid_read = 0

    while True:
        try:
            if ser is None or not ser.is_open:
                candidates = get_serial_candidates()
                if not candidates:
                    hardware_state["connected"] = False
                    hardware_state["serial_port"] = None
                    time.sleep(1)
                    continue

                current_port = candidates[candidate_index % len(candidates)]
                try:
                    ser = serial.Serial(current_port, BAUD_RATE, timeout=1)
                except (serial.SerialException, OSError) as error:
                    print(f"[SERIAL] Could not open {current_port}: {error}")
                    candidate_index += 1
                    hardware_state["connected"] = False
                    hardware_state["serial_port"] = None
                    time.sleep(0.25)
                    continue
                hardware_state["serial_port"] = current_port
                last_valid_read = time.monotonic()
                print(
                    f"[SERIAL] Listening on {current_port} at {BAUD_RATE} baud; "
                    "waiting for sensor data"
                )

            if (
                SERIAL_PORT.upper() == "AUTO"
                and current_port not in get_detected_serial_ports()
            ):
                hardware_state["connected"] = False
                hardware_state["serial_port"] = None
                raise serial.SerialException(
                    f"{current_port} disconnected; scanning for Arduino ports"
                )

            raw_line = ser.readline()
            if not raw_line:
                if time.monotonic() - last_valid_read > SENSOR_TIMEOUT_SECONDS:
                    raise TimeoutError(
                        f"No sensor data received on {current_port}"
                    )
                continue

            line = raw_line.decode("utf-8", errors="ignore").strip()
            if not line:
                continue

            try:
                temp, hum, dist, extra_sensors = parse_sensor_line(line)
            except ValueError as error:
                print(f"[IGNORED] Invalid sensor payload: {error}")
                if time.monotonic() - last_valid_read > SENSOR_TIMEOUT_SECONDS:
                    raise TimeoutError(
                        f"No valid sensor data received on {current_port}"
                    )
                continue

            try:
                with closing(sqlite3.connect(DB_FILE)) as conn, conn:
                    conn.execute(
                        """
                        INSERT INTO readings
                            (temperature, humidity, distance, timestamp, extra_sensors)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            temp,
                            hum,
                            dist,
                            datetime.now().astimezone().isoformat(timespec="seconds"),
                            json.dumps(extra_sensors),
                        ),
                    )
            except sqlite3.Error as error:
                print(f"[DATABASE ERROR] Could not save sensor reading: {error}")
                continue

            hardware_state["connected"] = True
            hardware_state["last_seen"] = time.time()
            last_valid_read = time.monotonic()
            print(
                f"[LIVE {current_port}] Temp: {temp}°C | Hum: {hum}% | "
                f"Dist: {dist} cm | Optional: {extra_sensors}"
            )
        except (serial.SerialException, OSError, TimeoutError) as error:
            print(f"[SERIAL] {error}")
            hardware_state["connected"] = False
            hardware_state["serial_port"] = None
            if ser is not None:
                try:
                    ser.close()
                except (serial.SerialException, OSError) as close_error:
                    print(f"[SERIAL] Error while closing port: {close_error}")
            ser = None
            current_port = None
            if SERIAL_PORT.upper() == "AUTO":
                candidate_index += 1
            time.sleep(0.25)

@app.route('/api/sensor', methods=['GET'])
def get_latest_sensor():
    is_live = hardware_state["connected"] and (
        (time.time() - hardware_state["last_seen"]) < SENSOR_TIMEOUT_SECONDS
    )

    try:
        with closing(sqlite3.connect(DB_FILE)) as conn, conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT temperature, humidity, distance, timestamp, extra_sensors
                FROM readings ORDER BY id DESC LIMIT 1
                """
            )
            row = cursor.fetchone()

        if row:
            return jsonify({
                "api_version": API_VERSION,
                "temperature": row[0],
                "humidity": row[1],
                "distance": cap_distance_cm(row[2]),
                "timestamp": row[3],
                "connected": is_live,
                "serial_port": hardware_state["serial_port"],
                "configured_port": SERIAL_PORT,
                "available_ports": get_detected_serial_ports(),
                "extra_sensors": json.loads(row[4] or "{}")
            }), 200
    except (sqlite3.Error, json.JSONDecodeError) as error:
        print(f"API Error: {error}")
    
    return jsonify({
        "api_version": API_VERSION,
        "temperature": None,
        "humidity": None,
        "distance": None,
        "timestamp": None,
        "connected": False,
        "serial_port": hardware_state["serial_port"],
        "configured_port": SERIAL_PORT,
        "available_ports": get_detected_serial_ports(),
        "extra_sensors": {}
    }), 200

@app.route('/api/history', methods=['GET'])
def get_history():
    try:
        with closing(sqlite3.connect(DB_FILE)) as conn, conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT temperature, humidity, distance, timestamp, extra_sensors
                FROM readings ORDER BY id DESC LIMIT 50
                """
            )
            rows = cursor.fetchall()

        data = [
            {
                "temperature": row[0],
                "humidity": row[1],
                "distance": cap_distance_cm(row[2]),
                "timestamp": row[3],
                "extra_sensors": json.loads(row[4] or "{}"),
            }
            for row in rows
        ]
        return jsonify(data)
    except (sqlite3.Error, json.JSONDecodeError) as error:
        print(f"History API Error: {error}")
        return jsonify({"error": "Unable to load sensor history"}), 500

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    init_db()
    threading.Thread(target=read_from_serial, daemon=True).start()
    threading.Timer(
        1,
        webbrowser.open,
        args=("http://localhost:5000/",),
    ).start()
    app.run(host='0.0.0.0', port=5000, debug=False)