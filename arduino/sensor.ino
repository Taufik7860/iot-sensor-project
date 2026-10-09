#include <math.h>

// Optional DHT11 support:
// 1. Install "DHT sensor library" by Adafruit and its Adafruit Unified Sensor dependency.
// 2. Uncomment the include, declarations, setup lines, read lines, and output lines below.
// #include <DHT.h>
// #define DHT_PIN 2
// #define DHT_TYPE DHT11
// DHT dht(DHT_PIN, DHT_TYPE);

// Ultrasonic Sensor (HC-SR04)
#define TRIG_PIN 9
#define ECHO_PIN 10
#define MAX_DISTANCE_CM 400.0f

// Optional sensors: uncomment the matching pin declaration, setup line,
// reading line, and printSensorField() line in loop().
// PIR motion sensor OUT -> pin 3
// #define PIR_PIN 3

// Analog sensor signal pins. Power sensors with the voltage specified by
// their module; Arduino UNO analog inputs must not exceed 5V.
// LDR module AO -> A0
// #define LDR_PIN A0
// Soil moisture module AO -> A1
// #define SOIL_MOISTURE_PIN A1
// MQ-2 gas module AO -> A2 (allow the sensor to warm up before relying on readings)
// #define MQ2_PIN A2
// Rain sensor AO -> A3
// #define RAIN_PIN A3
// Water level sensor AO -> A4
// #define WATER_LEVEL_PIN A4
// Flame sensor DO -> pin 4
// #define FLAME_PIN 4
// IR obstacle sensor DO -> pin 5 (common modules report detection as LOW)
// #define IR_OBSTACLE_PIN 5
// Sound sensor DO -> pin 6
// #define SOUND_PIN 6
// Vibration sensor DO -> pin 7
// #define VIBRATION_PIN 7

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

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // Optional DHT:
  // dht.begin();

  // Optional digital sensors:
  // pinMode(PIR_PIN, INPUT);
  // pinMode(FLAME_PIN, INPUT);
  // pinMode(IR_OBSTACLE_PIN, INPUT);
  // pinMode(SOUND_PIN, INPUT);
  // pinMode(VIBRATION_PIN, INPUT);
}

void loop() {
  delay(1000);

  float temperature = NAN;
  float humidity = NAN;
  float distance = NAN;

  // Optional DHT:
  // temperature = dht.readTemperature();
  // humidity = dht.readHumidity();

  // HC-SR04 distance in centimeters. A timeout avoids blocking if no echo arrives.
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  const unsigned long duration = pulseIn(ECHO_PIN, HIGH, 24000UL);
  if (duration > 0) {
    const float measuredDistance = duration * 0.0343f / 2.0f;
    distance = measuredDistance > MAX_DISTANCE_CM
      ? MAX_DISTANCE_CM
      : measuredDistance;
  }

  // Optional sensor readings:
  // const float pirMotion = digitalRead(PIR_PIN);
  // const float ldrLevel = analogRead(LDR_PIN);
  // const float soilMoisture = analogRead(SOIL_MOISTURE_PIN);
  // const float gasLevel = analogRead(MQ2_PIN);
  // const float rainLevel = analogRead(RAIN_PIN);
  // const float waterLevel = analogRead(WATER_LEVEL_PIN);
  // const float flameDetected = digitalRead(FLAME_PIN) == LOW ? 1.0f : 0.0f;
  // const float obstacleDetected = digitalRead(IR_OBSTACLE_PIN) == LOW ? 1.0f : 0.0f;
  // const float soundDetected = digitalRead(SOUND_PIN);
  // const float vibrationDetected = digitalRead(VIBRATION_PIN);

  // JSON keeps optional sensors self-describing so the backend and UI can
  // create a card as soon as a field is sent. Disabled sensors are omitted.
  Serial.print('{');
  bool firstField = true;
  printSensorField("temperature", temperature, firstField);
  printSensorField("humidity", humidity, firstField);
  printSensorField("distance", distance, firstField);

  // Uncomment the print line matching each enabled optional sensor:
  // printSensorField("pir", pirMotion, firstField);
  // printSensorField("ldr", ldrLevel, firstField);
  // printSensorField("soil_moisture", soilMoisture, firstField);
  // printSensorField("gas_level", gasLevel, firstField);
  // printSensorField("rain_level", rainLevel, firstField);
  // printSensorField("water_level", waterLevel, firstField);
  // printSensorField("flame_detected", flameDetected, firstField);
  // printSensorField("ir_obstacle", obstacleDetected, firstField);
  // printSensorField("sound_detected", soundDetected, firstField);
  // printSensorField("vibration_detected", vibrationDetected, firstField);

  Serial.println('}');
}
