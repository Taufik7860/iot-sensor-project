# IoT Sensor Monitor

This React dashboard displays the three built-in sensors (temperature, humidity,
and HC-SR04 distance) and automatically creates a card for each optional numeric
sensor sent by the Arduino.

## Run the complete project

From the project root, run:

```bat
start_app.bat
```

Once Node.js dependencies and the project Python environment have been set up,
the script builds with locally installed npm packages and starts the Flask
backend. Normal dashboard use does not require an internet connection. It opens
the dashboard at `http://localhost:5000/`. Run `.\start_app.bat` in the VS Code
integrated terminal; the backend stays in that same terminal, with no extra
backend console. Keep the terminal running while using the dashboard and press
`Ctrl+C` there to stop it. The backend scans for Arduino/USB-serial ports at
`9600` baud, reconnects after the Arduino is unplugged and plugged back in, and
marks it online again when valid sensor data arrives. To force a particular
port, set `ARDUINO_PORT` before starting the app, for example
`set ARDUINO_PORT=COM8`.

If port 5000 is occupied by an outdated backend, stop its terminal with
`Ctrl+C` and run the script again. If dependencies are missing, set them up
once while online; the script deliberately does not download packages.

To run the frontend in Vite development mode instead:

```bat
cd frontend
npm run dev
```

Start the backend separately from the project root with
`.venv\Scripts\python.exe backend\app.py`.

## Enable an optional Arduino sensor

Open `arduino/sensor.ino` and uncomment the complete matching set of lines:

1. The sensor pin declaration near the top of the sketch.
2. Its `pinMode` line in `setup()` if the module uses a digital pin.
3. Its reading declaration in `loop()`.
4. Its matching `printSensorField(...)` line near the JSON output.

For the DHT example, also uncomment its library include, pin/type declarations,
`dht.begin()` line, and temperature/humidity read lines.

Ready-to-enable modules and their JSON keys are:

| Module | Arduino pin | Dashboard key |
| --- | --- | --- |
| DHT11 temperature/humidity | D2 | `temperature`, `humidity` |
| PIR motion | D3 | `pir` |
| LDR light | A0 | `ldr` |
| Soil moisture | A1 | `soil_moisture` |
| MQ-2 gas | A2 | `gas_level` |
| Rain sensor | A3 | `rain_level` |
| Water level | A4 | `water_level` |
| Flame sensor | D4 | `flame_detected` |
| IR obstacle | D5 | `ir_obstacle` |
| Sound | D6 | `sound_detected` |
| Vibration | D7 | `vibration_detected` |

To show an optional module's blank card before it has ever reported data,
uncomment its matching key in `ENABLED_OPTIONAL_SENSORS` near the top of
`frontend/src/App.jsx`. This step is optional: after the Arduino sends a reading,
the dashboard creates that sensor card automatically.

The DHT11 example uses D2 and requires the Adafruit DHT Sensor Library and
Adafruit Unified Sensor library. DHT readings are `null` until those DHT lines
are enabled. Do not assign the same pin to two modules. Analog sensor cards
show raw ADC readings; calibrate them for meaningful physical units.

Upload the sketch after enabling a module, then start the project. The backend
stores optional readings and the dashboard automatically adds cards for keys
it receives. The database is upgraded automatically while keeping existing
readings.

When the Arduino disconnects, the dashboard marks sensors **OFFLINE** and
shows zero readings until live data resumes.

Close the Arduino IDE Serial Monitor (or any other program using the Arduino's
COM port) while the dashboard is running. Confirm the uploaded sketch sends
JSON lines at `9600` baud (or the supported legacy three-value CSV format). The
HC-SR04 reading is limited to `400 cm`. The backend and UI mark the Arduino
green **Online** after sensor data arrives and return to **Offline** if data
stops for five seconds.
