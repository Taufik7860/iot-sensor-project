import { useEffect, useState, useCallback } from "react";
import "./App.css";

const API_URL = `http://${window.location.hostname}:5000`;
const VIDEO_URL = "/Video%20Project%201.mp4";

const EXTRA_SENSOR_INFO = {
  pir: {
    title: "Motion",
    module: "PIR Motion Sensor",
    icon: "🚶",
    unit: "",
    max: 1,
    format: (value) => (value ? "Motion detected" : "No motion"),
  },
  ldr: {
    title: "Light Level",
    module: "LDR Sensor",
    icon: "☀️",
    unit: "raw",
    max: 1023,
  },
  soil_moisture: {
    title: "Soil Moisture",
    module: "Soil Moisture Sensor",
    icon: "🌱",
    unit: "raw",
    max: 1023,
  },
  gas_level: {
    title: "Gas Level",
    module: "MQ-2 Gas Sensor",
    icon: "☁️",
    unit: "raw",
    max: 1023,
  },
  rain_level: {
    title: "Rain Level",
    module: "Rain Sensor",
    icon: "🌧️",
    unit: "raw",
    max: 1023,
  },
  water_level: {
    title: "Water Level",
    module: "Water Level Sensor",
    icon: "🌊",
    unit: "raw",
    max: 1023,
  },
  flame_detected: {
    title: "Flame",
    module: "Flame Sensor",
    icon: "🔥",
    unit: "",
    max: 1,
    format: (value) => (value ? "Detected" : "Not detected"),
  },
  ir_obstacle: {
    title: "IR Obstacle",
    module: "IR Obstacle Sensor",
    icon: "📡",
    unit: "",
    max: 1,
    format: (value) => (value ? "Obstacle detected" : "Clear"),
  },
  sound_detected: {
    title: "Sound",
    module: "Sound Sensor",
    icon: "🔊",
    unit: "",
    max: 1,
    format: (value) => (value ? "Sound detected" : "Quiet"),
  },
  vibration_detected: {
    title: "Vibration",
    module: "Vibration Sensor",
    icon: "〰️",
    unit: "",
    max: 1,
    format: (value) => (value ? "Vibration detected" : "No vibration"),
  },
};

// Uncomment a key here when you want its empty/offline card before the Arduino
// has sent its first reading. Received keys create cards automatically.
const ENABLED_OPTIONAL_SENSORS = [
   //"pir",
   //"ldr",
   //"soil_moisture",
   //"gas_level",
   //"rain_level",
   //"water_level",
   //"flame_detected",
   //"ir_obstacle",
   "sound_detected",
   "vibration_detected",
];

const toOptionalNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatSensorName = (name) =>
  name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const formatStoredTimestamp = (timestamp) => {
  if (!timestamp) {
    return null;
  }

  const parsedDate = new Date(`${timestamp.replace(" ", "T")}Z`);
  return Number.isNaN(parsedDate.getTime())
    ? null
    : parsedDate.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
};

const getReadingRangeClass = (sensor, value) => {
  if (value === null) {
    return "range-empty";
  }

  if (sensor === "temperature") {
    if (value < 18) return "range-cool";
    if (value < 30) return "range-good";
    if (value < 40) return "range-warn";
    return "range-danger";
  }

  if (sensor === "humidity") {
    if (value < 30) return "range-warn";
    if (value <= 60) return "range-good";
    if (value <= 80) return "range-warn";
    return "range-danger";
  }

  if (sensor === "distance") {
    if (value <= 50) return "range-danger";
    if (value <= 150) return "range-warn";
    return "range-good";
  }

  return "range-info";
};

const getOptionalRangeClass = (name, value, max) => {
  if (value === null) {
    return "range-empty";
  }

  if (name === "flame_detected") {
    return value > 0 ? "range-danger" : "range-good";
  }

  if (name === "ir_obstacle") {
    return value > 0 ? "range-warn" : "range-good";
  }

  if (["pir", "sound_detected", "vibration_detected"].includes(name)) {
    return value > 0 ? "range-info" : "range-good";
  }

  const percentage = (Math.max(value, 0) / max) * 100;
  if (percentage < 25) return "range-info";
  if (percentage < 60) return "range-good";
  if (percentage < 85) return "range-warn";
  return "range-danger";
};

function App() {
  const [temperature, setTemperature] = useState(null);
  const [humidity, setHumidity] = useState(null);
  const [distance, setDistance] = useState(null);
  const [extraSensors, setExtraSensors] = useState({});
  const [online, setOnline] = useState(false);
  const [serialPort, setSerialPort] = useState(null);
  const [availablePorts, setAvailablePorts] = useState([]);
  const [backendVersion, setBackendVersion] = useState(0);
  const [lastUpdate, setLastUpdate] = useState("--:--:--");
  const [videoError, setVideoError] = useState(false);

  // ==========================================
  // FETCH SENSOR DATA FROM LOCAL FLASK BACKEND
  // ==========================================

  const fetchSensorData = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/sensor`);

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();

      setBackendVersion(Number(data.api_version) || 0);
      setSerialPort(data.serial_port ?? null);
      setAvailablePorts(
        Array.isArray(data.available_ports) ? data.available_ports : []
      );
      setTemperature(toOptionalNumber(data.temperature));
      setHumidity(toOptionalNumber(data.humidity));
      const receivedDistance = toOptionalNumber(data.distance);
      setDistance(
        receivedDistance === null
          ? null
          : Math.min(Math.max(receivedDistance, 0), 400)
      );
      setExtraSensors(
        Object.fromEntries(
          Object.entries(data.extra_sensors ?? {}).filter(
            ([, value]) => toOptionalNumber(value) !== null
          )
        )
      );

      const isConnected = data.connected === true;
      setOnline(isConnected);

      if (isConnected) {
        setLastUpdate(
          new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })
        );
      } else {
        setLastUpdate(formatStoredTimestamp(data.timestamp) ?? "--:--:--");
      }
    } catch (error) {
      console.warn("Sensor backend unavailable:", error);
      setOnline(false);
      setSerialPort(null);
      setAvailablePorts([]);
      setBackendVersion(0);
    }
  }, []);

  // ==========================================
  // Refresh frequently so Arduino reconnects appear promptly.
  // ==========================================

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void fetchSensorData();
    }, 0);

    const interval = window.setInterval(() => {
      void fetchSensorData();
    }, 1000);

    return () => {
      window.clearTimeout(initialFetch);
      window.clearInterval(interval);
    };
  }, [fetchSensorData]);

  // ==========================================
  // SENSOR PROGRESS VALUES
  // ==========================================

  const tempValue =
    online && temperature !== null
      ? Math.min(Math.max(temperature, 0), 50)
      : 0;

  const humidityValue =
    online && humidity !== null
      ? Math.min(Math.max(humidity, 0), 100)
      : 0;

  const distanceValue = online ? distance ?? 0 : 0;
  const displayedTemperature = online ? temperature ?? 0 : 0;
  const displayedHumidity = online ? humidity ?? 0 : 0;
  const displayedDistance = online ? distance ?? 0 : 0;

  return (
    <div className="dashboard">
      {/* BACKGROUND VIDEO */}
      <video
        className="background-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        onError={() => {
          setVideoError(true);
        }}
      >
        <source src={VIDEO_URL} type="video/mp4" />
      </video>

      <div className="background-video-overlay" aria-hidden="true" />

      {videoError && <div className="video-fallback" aria-hidden="true" />}

      {/* BACKGROUND GLOW */}
      <div className="glow glow-one" />
      <div className="glow glow-two" />

      {/* TOP NAVIGATION */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="9" y="9" width="6" height="6" />
              <path d="M15 2v2" />
              <path d="M15 20v2" />
              <path d="M2 15h2" />
              <path d="M2 9h2" />
              <path d="M20 15h2" />
              <path d="M20 9h2" />
              <path d="M9 2v2" />
              <path d="M9 20v2" />
            </svg>
          </div>

          <div>
            <h1>IoT Sensor Monitor</h1>
            <p>Arduino Environmental & Obstacle Sensing System</p>
          </div>
        </div>

        <div className={`connection ${online ? "online" : "offline"}`}>
          <span className="status-dot" />

          <div>
            <strong>
              {online ? "Arduino Online" : "Arduino Offline"}
            </strong>

            <small>
              {backendVersion < 3
                ? "Backend is outdated. Stop it and run start_app.bat again."
                : online
                  ? `Receiving live data${serialPort ? ` on ${serialPort}` : ""}`
                  : serialPort
                    ? `Port ${serialPort} open; waiting for valid sensor data`
                    : availablePorts.length > 0
                      ? `Detected ${availablePorts.join(", ")}; connecting`
                      : "No COM port detected. Check USB cable and driver."}
            </small>
          </div>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="hero-3d">
        <div className="hero-content">
          <span className="eyebrow eyebrow-top">
            REAL-TIME IOT DASHBOARD
          </span>

          <h2>
            Environmental & <span>Obstacle Sensing</span>
          </h2>

          <p>
            Monitor temperature, humidity, and real-time object/obstacle distance from your Arduino system.
          </p>

          <div className="hero-stats">
            <div>
              <strong>
                {displayedTemperature.toFixed(1)}°C
              </strong>
              <span>Temperature</span>
            </div>

            <div>
              <strong>
                {displayedHumidity.toFixed(1)}%
              </strong>
              <span>Humidity</span>
            </div>

            <div>
              <strong>
                {displayedDistance.toFixed(1)} cm
              </strong>
              <span>Obstacle Distance</span>
            </div>

            <div>
              <strong className={online ? "status-online-text" : "status-offline-text"}>
                {online ? "ONLINE" : "OFFLINE"}
              </strong>
              <span>Arduino</span>
            </div>
          </div>

          <div className={`hero-live ${online ? "online" : "offline"}`}>
            <span className="status-dot" />
            {online ? "LIVE SENSOR MONITORING" : "WAITING FOR ARDUINO"}
          </div>
        </div>
      </section>

      {/* SENSOR CARDS */}
      <section className="sensor-grid">
        {/* Temperature Card */}
        <div className="sensor-card temperature-card">
          <div className="card-top">
            <div className="sensor-title">
              <div className="sensor-icon temp-icon">🌡️</div>
              <div>
                <span>Temperature</span>
                <small>DHT11 Sensor</small>
              </div>
            </div>

            <div className={`mini-status ${online ? "online" : "offline"}`}>
              <span className="status-dot" />
              {online ? "LIVE" : "OFFLINE"}
            </div>
          </div>

          <div className="sensor-value">
            {displayedTemperature.toFixed(1)}
            <sup>°C</sup>
          </div>

          <div className="progress-area">
            <div className="progress-label">
              <span>Current Level</span>
              <b>{displayedTemperature.toFixed(1)} °C</b>
            </div>

            <div className="progress">
              <div
                className={`progress-fill temp-fill ${getReadingRangeClass("temperature", displayedTemperature)}`}
                style={{ width: `${(tempValue / 50) * 100}%` }}
              />
            </div>

            <div className="range">
              <span>0°C</span>
              <span>25°C</span>
              <span>50°C</span>
            </div>
          </div>
        </div>

        {/* Humidity Card */}
        <div className="sensor-card humidity-card">
          <div className="card-top">
            <div className="sensor-title">
              <div className="sensor-icon humidity-icon">💧</div>
              <div>
                <span>Humidity</span>
                <small>DHT11 Sensor</small>
              </div>
            </div>

            <div className={`mini-status ${online ? "online" : "offline"}`}>
              <span className="status-dot" />
              {online ? "LIVE" : "OFFLINE"}
            </div>
          </div>

          <div className="sensor-value">
            {displayedHumidity.toFixed(1)}
            <sup>%</sup>
          </div>

          <div className="progress-area">
            <div className="progress-label">
              <span>Current Level</span>
              <b>{displayedHumidity.toFixed(1)} %</b>
            </div>

            <div className="progress">
              <div
                className={`progress-fill humidity-fill ${getReadingRangeClass("humidity", displayedHumidity)}`}
                style={{ width: `${humidityValue}%` }}
              />
            </div>

            <div className="range">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Obstacle / Object Distance Card */}
        <div className="sensor-card distance-card">
          <div className="card-top">
            <div className="sensor-title">
              <div className="sensor-icon distance-icon">📏</div>
              <div>
                <span>Obstacle / Object Distance</span>
                <small>HC-SR04 Sensor</small>
              </div>
            </div>

            <div className={`mini-status ${online ? "online" : "offline"}`}>
              <span className="status-dot" />
              {online ? "LIVE" : "OFFLINE"}
            </div>
          </div>

          <div className="sensor-value">
            {displayedDistance.toFixed(1)}
            <sup>cm</sup>
          </div>

          <div className="progress-area">
            <div className="progress-label">
              <span>Proximity Range</span>
              <b>{displayedDistance.toFixed(1)} cm</b>
            </div>

            <div className="progress">
              <div
                className={`progress-fill distance-fill ${getReadingRangeClass("distance", displayedDistance)}`}
                style={{ width: `${(distanceValue / 400) * 100}%` }}
              />
            </div>

            <div className="range">
              <span>0cm</span>
              <span>200cm</span>
              <span>400cm</span>
            </div>
          </div>
        </div>

        {[...new Set([...ENABLED_OPTIONAL_SENSORS, ...Object.keys(extraSensors)])].map((name) => {
          const receivedValue = toOptionalNumber(extraSensors[name]);
          const value = online ? receivedValue : 0;
          const sensor = EXTRA_SENSOR_INFO[name] ?? {
            title: formatSensorName(name),
            module: "Optional Sensor",
            icon: "◉",
            unit: "",
            max: Math.max(Number(value) || 0, 100),
          };
          const numericValue = value ?? 0;
          const displayValue =
            !online
              ? "0"
              : value === null
              ? "--"
              : sensor.format
                ? sensor.format(numericValue)
                : `${numericValue.toFixed(1)}${sensor.unit ? ` ${sensor.unit}` : ""}`;
          const progress = Math.min(
            Math.max((numericValue / sensor.max) * 100, 0),
            100
          );

          return (
            <article className="sensor-card extra-sensor-card" key={name}>
              <div className="card-top">
                <div className="sensor-title">
                  <div className="sensor-icon extra-icon" aria-hidden="true">
                    {sensor.icon}
                  </div>
                  <div>
                    <span>{sensor.title}</span>
                    <small>{sensor.module}</small>
                  </div>
                </div>

                <div className={`mini-status ${online ? "online" : "offline"}`}>
                  <span className="status-dot" />
                  {online ? "LIVE" : "OFFLINE"}
                </div>
              </div>

              <div className="sensor-value extra-sensor-value">{displayValue}</div>

              <div className="progress-area">
                <div className="progress-label">
                  <span>{online ? "Current reading" : "No live data"}</span>
                  <b>{value === null ? "0" : numericValue.toFixed(1)}</b>
                </div>
                <div className="progress">
                  <div
                    className={`progress-fill extra-fill ${getOptionalRangeClass(name, value, sensor.max)}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {/* SYSTEM STATUS */}
      <section className="info-grid">
        <div className="info-card">
          <div className="info-icon">⚡</div>
          <div>
            <span>System Status</span>
            <strong>{online ? "Operational" : "Offline"}</strong>
          </div>
          <div className={`system-indicator ${online ? "active" : "offline"}`}>
            <span className="status-dot" />
          </div>
        </div>

        <div className="info-card">
          <div className="info-icon">↻</div>
          <div>
            <span>Last Data Update</span>
            <strong>{lastUpdate}</strong>
          </div>
        </div>

        <div className="info-card">
          <div className="info-icon">◉</div>
          <div>
            <span>Communication</span>
            <strong>USB Serial</strong>
          </div>
        </div>
      </section>

      {/* SYSTEM INFORMATION */}
      <section className="system-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">DEVICE CONFIGURATION</span>
            <h2>System Information</h2>
          </div>

          <div className={`device-status ${online ? "online" : "offline"}`}>
            <span className="status-dot" />
            Arduino UNO
          </div>
        </div>

        <div className="system-grid">
          <div className="system-item">
            <span className="system-item-icon">▣</span>
            <div>
              <small>Microcontroller</small>
              <strong>Arduino UNO</strong>
            </div>
          </div>

          <div className="system-item">
            <span className="system-item-icon">♨</span>
            <div>
              <small>Environment Sensor</small>
              <strong>DHT11</strong>
            </div>
          </div>

          <div className="system-item">
            <span className="system-item-icon">📏</span>
            <div>
              <small>Ultrasonic Sensor</small>
              <strong>HC-SR04</strong>
            </div>
          </div>

          <div className="system-item">
            <span className="system-item-icon">⌁</span>
            <div>
              <small>Connection</small>
              <strong>USB Serial</strong>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div>
          <strong>IoT Sensor Monitor</strong>
          <span>Arduino Environmental & Obstacle Sensing</span>
        </div>

        <span>Last refresh: {lastUpdate}</span>
      </footer>
    </div>
  );
}

export default App;