#include <DHT.h>
#include <math.h>

#define DHT_PIN 3
#define DHT_TYPE DHT11
#define LDR_PIN A0
#define RAIN_ANALOG_PIN A1
#define PANEL_VOLTAGE_PIN A2
#define RAIN_DIGITAL_PIN 2

const float ADC_REFERENCE_VOLTS = 5.0f;
const int DAYLIGHT_ADC_THRESHOLD = 512;
const bool BRIGHTER_WHEN_ADC_HIGHER = true;
const bool RAIN_DETECTED_WHEN_DO_LOW = true;

DHT dht(DHT_PIN, DHT_TYPE);

void printSensorField(const char* name, float value, bool& firstField) {
  if (!firstField) {
    Serial.print(',');
  }

  Serial.print('"');
  Serial.print(name);
  Serial.print("\":");

  if (isnan(value)) {
    Serial.print("null");
  } else {
    Serial.print(value, 1);
  }

  firstField = false;
}

void setup() {
  Serial.begin(9600);
  pinMode(RAIN_DIGITAL_PIN, INPUT);
  dht.begin();
}

void loop() {
  delay(2000);

  const float temperature = dht.readTemperature();
  const float humidity = dht.readHumidity();
  const int ldrReading = analogRead(LDR_PIN);
  const int rainAnalog = analogRead(RAIN_ANALOG_PIN);
  const int rainDigital = digitalRead(RAIN_DIGITAL_PIN);
  const int panelVoltageAdc = analogRead(PANEL_VOLTAGE_PIN);
  const float panelVoltage = panelVoltageAdc * (ADC_REFERENCE_VOLTS / 1023.0f);

  const float lightPercent = BRIGHTER_WHEN_ADC_HIGHER
    ? (ldrReading / 1023.0f) * 100.0f
    : ((1023 - ldrReading) / 1023.0f) * 100.0f;
  const bool isDaylight = BRIGHTER_WHEN_ADC_HIGHER
    ? ldrReading >= DAYLIGHT_ADC_THRESHOLD
    : ldrReading <= DAYLIGHT_ADC_THRESHOLD;
  const bool isRaining = RAIN_DETECTED_WHEN_DO_LOW
    ? rainDigital == LOW
    : rainDigital == HIGH;

  Serial.print('{');
  bool firstField = true;
  printSensorField("temperature", temperature, firstField);
  printSensorField("humidity", humidity, firstField);
  printSensorField("ldr", ldrReading, firstField);
  printSensorField("light_percent", lightPercent, firstField);
  printSensorField("panel_voltage", panelVoltage, firstField);
  printSensorField("daylight", isDaylight ? 1.0f : 0.0f, firstField);
  printSensorField("rain_analog", rainAnalog, firstField);
  printSensorField("rain_digital", rainDigital, firstField);
  printSensorField("rain_detected", isRaining ? 1.0f : 0.0f, firstField);
  Serial.println('}');
}
