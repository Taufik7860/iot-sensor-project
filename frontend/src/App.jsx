import { useCallback, useEffect, useState } from "react";
import "./App.css";

const API_URL =
  window.location.port === "5000" ? "" : "http://127.0.0.1:5000";
const VIDEO_URL = "/Video%20Project%201.mp4";
const MAX_ADC = 1023;
const ADC_REFERENCE_VOLTS = 5;

const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatTimestamp = (timestamp) => {
  if (!timestamp) return "--:--:--";

  const normalized = timestamp.replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}Z`);

  return Number.isNaN(date.getTime())
    ? "--:--:--"
    : date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
};

const statusClass = (active) => (active ? "online" : "offline");

function SensorCard({
  title,
  module,
  icon,
  value,
  unit,
  status,
  progress,
  progressLabel,
  progressValue,
  rangeLabels,
  className = "",
  details,
}) {
  const safeProgress = Math.min(Math.max(progress ?? 0, 0), 100);

  return (
    <article className={`sensor-card ${className}`}>
      <div className="card-top">
        <div className="sensor-title">
          <div className="sensor-icon extra-icon" aria-hidden="true">
            {icon}
          </div>
          <div>
            <span>{title}</span>
            <small>{module}</small>
          </div>
        </div>
        <span className={`mini-status ${statusClass(status.active)}`}>
          <span className="status-dot" />
          {status.label}
        </span>
      </div>

      <div className="sensor-value extra-sensor-value">
        {value}
        {unit && <sup>{unit}</sup>}
      </div>

      {details && <p className="reading-note">{details}</p>}

      <div className="progress-area">
        <div className="progress-label">
          <span>{progressLabel}</span>
          <b>{progressValue}</b>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-label={progressLabel}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={Math.round(safeProgress)}
        >
          <div
            className="progress-fill extra-fill"
            style={{ width: `${safeProgress}%` }}
          />
        </div>
        {rangeLabels && (
          <div className="range">
            {rangeLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function App() {
  const [reading, setReading] = useState(null);
  const [online, setOnline] = useState(false);
  const [serialPort, setSerialPort] = useState(null);
  const [configuredPort, setConfiguredPort] = useState(null);
  const [availablePorts, setAvailablePorts] = useState([]);
  const [backendVersion, setBackendVersion] = useState(0);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [lastUpdate, setLastUpdate] = useState("--:--:--");
  const [videoError, setVideoError] = useState(false);

  const fetchSensorData = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/sensor`);
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data = await response.json();
      setBackendAvailable(true);
      setBackendVersion(Number(data.api_version) || 0);
      setSerialPort(data.serial_port ?? null);
      setConfiguredPort(data.configured_port ?? null);
      setAvailablePorts(
        Array.isArray(data.available_ports) ? data.available_ports : []
      );
      setReading({
        temperature: toNumber(data.temperature),
        humidity: toNumber(data.humidity),
        extra: data.extra_sensors ?? {},
      });

      const connected = data.connected === true;
      setOnline(connected);
      setLastUpdate(
        connected
          ? new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })
          : formatTimestamp(data.timestamp)
      );
    } catch (error) {
      console.warn("Sensor backend unavailable:", error);
      setBackendAvailable(false);
      setOnline(false);
      setSerialPort(null);
      setAvailablePorts([]);
      setBackendVersion(0);
    }
  }, []);

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

  const extra = reading?.extra ?? {};
  const ldr = online ? toNumber(extra.ldr) : null;
  const lightPercent = online ? toNumber(extra.light_percent) : null;
  const panelVoltage = online ? toNumber(extra.panel_voltage) : null;
  const daylight = online ? toNumber(extra.daylight) : null;
  const rainAnalog = online ? toNumber(extra.rain_analog) : null;
  const rainDigital = online ? toNumber(extra.rain_digital) : null;
  const rainDetected = online ? toNumber(extra.rain_detected) : null;
  const estimatedPotential =
    lightPercent ??
    (ldr === null ? null : Math.round((ldr / MAX_ADC) * 1000) / 10);
  const estimatedPerformance =
    estimatedPotential === null || panelVoltage === null
      ? null
      : Math.round(
          estimatedPotential *
            Math.min(Math.max(panelVoltage / ADC_REFERENCE_VOLTS, 0), 1) *
            10
        ) / 10;
  const temperature = online ? reading?.temperature ?? null : null;
  const humidity = online ? reading?.humidity ?? null : null;
  const connectionMessage =
    !backendAvailable
      ? "Dashboard backend unavailable. Start the app with .\\start_app.bat."
      : backendVersion < 6
        ? "Backend is outdated. Stop it and run start_app.bat again."
      : online
        ? `Receiving live data${serialPort ? ` on ${serialPort}` : ""}`
        : serialPort
          ? `Port ${serialPort} open; waiting for sensor data`
          : configuredPort &&
              !availablePorts.some(
                (port) => port.toLowerCase() === configuredPort.toLowerCase()
              )
            ? `${configuredPort} not detected. Connect the Arduino and check its USB cable.`
            : configuredPort
              ? `Connecting to ${configuredPort}; waiting for sensor data`
                  : availablePorts.length > 0
                    ? `Detected ${availablePorts.join(", ")}; connecting`
                    : "No COM port detected. Check the USB cable and driver.";

  return (
    <main className="dashboard">
      <video
        className="background-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        onError={() => setVideoError(true)}
      >
        <source src={VIDEO_URL} type="video/mp4" />
      </video>
      <div className="background-video-overlay" aria-hidden="true" />
      {videoError && <div className="video-fallback" aria-hidden="true" />}
      <div className="glow glow-one" aria-hidden="true" />
      <div className="glow glow-two" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">☀</div>
          <div>
            <h1>Solar Guard</h1>
            <p>Solar panel environment monitor</p>
          </div>
        </div>
        <div className={`connection ${statusClass(online)}`}>
          <span className="status-dot" />
          <div>
            <strong>{online ? "Arduino Online" : "Arduino Offline"}</strong>
            <small>{connectionMessage}</small>
          </div>
        </div>
      </header>

      <section className="hero-3d">
        <div className="hero-content">
          <span className="eyebrow eyebrow-top">LIVE SOLAR CONDITIONS</span>
          <h2>
            Monitor your <span>solar panel environment</span>
          </h2>
          <p>
            Track sunlight, rain, and ambient temperature and humidity using
            only the sensors connected to your Arduino.
          </p>
          <div className="hero-stats">
            <div>
              <strong>{estimatedPerformance === null ? "--" : `${estimatedPerformance.toFixed(1)}%`}</strong>
              <span>Estimated performance index</span>
            </div>
            <div>
              <strong>{estimatedPotential === null ? "--" : `${estimatedPotential.toFixed(1)}%`}</strong>
              <span>Relative LDR light</span>
            </div>
            <div>
              <strong>
                {rainDetected === null
                  ? "--"
                  : rainDetected > 0
                    ? "RAIN"
                    : "DRY"}
              </strong>
              <span>Rain sensor</span>
            </div>
          </div>
          <p className="solar-disclaimer">
            The index is relative LDR light (%) × measured A2 voltage ÷ 5 V.
            It is not true panel efficiency: that requires calibrated irradiance,
            panel current, and a rated power reference.
          </p>
          <div className={`hero-live ${statusClass(online)}`}>
            <span className="status-dot" />
            {online ? "LIVE SENSOR MONITORING" : "WAITING FOR ARDUINO"}
          </div>
        </div>
      </section>

      <section className="sensor-grid" aria-label="Live sensor readings">
        <SensorCard
          title="Light level"
          module="LDR · Analog A0"
          icon="☀️"
          value={online && ldr !== null ? ldr.toFixed(0) : "--"}
          unit={`/ ${MAX_ADC}`}
          status={{
            active: online && daylight !== null && daylight > 0,
            label: !online || daylight === null
              ? online ? "NO READING" : "OFFLINE"
              : daylight > 0 ? "DAYLIGHT" : "NIGHT",
          }}
          progress={estimatedPotential}
          progressLabel="Relative light level"
          progressValue={estimatedPotential === null ? "--" : `${estimatedPotential.toFixed(1)}%`}
          rangeLabels={["0", "ADC raw", "1023"]}
          details="Day/night is determined by a configurable ADC threshold in the Arduino sketch."
          className="light-card"
        />

        <SensorCard
          title="Rain"
          module="Rain module · Analog A1 + Digital D2"
          icon="🌧️"
          value={
            !online || rainDetected === null
              ? "--"
              : rainDetected > 0 ? "Rain detected" : "No rain"
          }
          status={{
            active: online && rainDetected === 0,
            label: !online || rainDetected === null
              ? online ? "NO READING" : "OFFLINE"
              : rainDetected > 0 ? "WET" : "DRY",
          }}
          progress={
            rainAnalog === null ? 0 : (rainAnalog / MAX_ADC) * 100
          }
          progressLabel="Analog sensor reading"
          progressValue={
            online && rainAnalog !== null
              ? `${rainAnalog.toFixed(0)} / ${MAX_ADC}`
              : "--"
          }
          rangeLabels={["0", "ADC raw", "1023"]}
          details={
            online && rainDigital !== null
              ? `Digital output: ${rainDigital === 0 ? "LOW" : "HIGH"}`
              : "Digital output: --"
          }
          className="rain-card"
        />

        <SensorCard
          title="Panel voltage input"
          module="Potentiometer / voltage signal · Analog A2"
          icon="⚡"
          value={
            online && panelVoltage !== null ? panelVoltage.toFixed(2) : "--"
          }
          unit="V"
          status={{
            active: online && panelVoltage !== null,
            label: online && panelVoltage !== null
              ? "LIVE"
              : online ? "NO READING" : "OFFLINE",
          }}
          progress={
            panelVoltage === null
              ? 0
              : (panelVoltage / ADC_REFERENCE_VOLTS) * 100
          }
          progressLabel="Input voltage"
          progressValue={
            online && panelVoltage !== null
              ? `${panelVoltage.toFixed(2)} / ${ADC_REFERENCE_VOLTS.toFixed(2)} V`
              : "--"
          }
          rangeLabels={["0 V", "2.5 V", "5 V"]}
          details="Converted from the A2 ADC reading using a nominal 5 V reference."
          className="voltage-card"
        />

        <SensorCard
          title="Estimated performance index"
          module="Relative LDR light × normalized voltage"
          icon="📈"
          value={
            online && estimatedPerformance !== null
              ? estimatedPerformance.toFixed(1)
              : "--"
          }
          unit="%"
          status={{
            active: online && estimatedPerformance !== null,
            label: online && estimatedPerformance !== null
              ? "ESTIMATE"
              : online ? "NEEDS LDR + VOLTAGE" : "OFFLINE",
          }}
          progress={estimatedPerformance}
          progressLabel="Relative performance score"
          progressValue={
            online && estimatedPerformance !== null
              ? `${estimatedPerformance.toFixed(1)}%`
              : "--"
          }
          rangeLabels={["0%", "50%", "100%"]}
          details="An estimate for this project, not the solar panel's measured electrical efficiency."
          className="performance-card"
        />

        <SensorCard
          title="Temperature"
          module="DHT11 · Digital D3"
          icon="🌡️"
          value={online && temperature !== null ? temperature.toFixed(1) : "--"}
          unit="°C"
          status={{
            active: online && temperature !== null,
            label: online && temperature !== null ? "LIVE" : online ? "NO READING" : "OFFLINE",
          }}
          progress={temperature === null ? 0 : (temperature / 50) * 100}
          progressLabel="Ambient temperature"
          progressValue={
            online && temperature !== null ? `${temperature.toFixed(1)} °C` : "--"
          }
          rangeLabels={["0°C", "25°C", "50°C"]}
          className="temperature-card"
        />

        <SensorCard
          title="Humidity"
          module="DHT11 · Digital D3"
          icon="💧"
          value={online && humidity !== null ? humidity.toFixed(1) : "--"}
          unit="%"
          status={{
            active: online && humidity !== null,
            label: online && humidity !== null ? "LIVE" : online ? "NO READING" : "OFFLINE",
          }}
          progress={humidity ?? 0}
          progressLabel="Ambient humidity"
          progressValue={
            online && humidity !== null ? `${humidity.toFixed(1)}%` : "--"
          }
          rangeLabels={["0%", "50%", "100%"]}
          className="humidity-card"
        />
      </section>

      <section className="info-grid" aria-label="System status">
        <div className="info-card">
          <div className="info-icon">⚡</div>
          <div>
            <span>Arduino connection</span>
            <strong>{online ? "Operational" : "Offline"}</strong>
          </div>
          <div className={`system-indicator ${statusClass(online)}`}>
            <span className="status-dot" />
          </div>
        </div>
        <div className="info-card">
          <div className="info-icon">◷</div>
          <div>
            <span>Last data update · laptop time</span>
            <strong>{lastUpdate}</strong>
          </div>
        </div>
        <div className="info-card">
          <div className="info-icon">▤</div>
          <div>
            <span>Data storage</span>
            <strong>Local SQLite database</strong>
          </div>
        </div>
      </section>

      <section className="system-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">PROJECT SETUP</span>
            <h2>Connected hardware</h2>
          </div>
          <div className={`device-status ${statusClass(online)}`}>
            <span className="status-dot" />
            Arduino UNO
          </div>
        </div>
        <div className="system-grid">
          <div className="system-item">
            <span className="system-item-icon">▣</span>
            <div><small>Microcontroller</small><strong>Arduino UNO · USB serial</strong></div>
          </div>
          <div className="system-item">
            <span className="system-item-icon">☀</span>
            <div><small>Light sensor</small><strong>LDR · A0</strong></div>
          </div>
          <div className="system-item">
            <span className="system-item-icon">☂</span>
            <div><small>Rain sensor</small><strong>AO · A1 / DO · D2</strong></div>
          </div>
          <div className="system-item">
            <span className="system-item-icon">🌡</span>
            <div><small>Environment sensor</small><strong>DHT11 · D3</strong></div>
          </div>
        </div>
      </section>

      <footer>
        <div>
          <strong>Solar Guard</strong>
          <span>Arduino sensor monitoring · saved locally</span>
        </div>
        <span>Last update: {lastUpdate}</span>
      </footer>
    </main>
  );
}

export default App;
