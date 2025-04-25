/*
 * Arduino Ultrasonic Sensor with ESP8266 Communication
 * Reads distance from ultrasonic sensor and sends to ESP8266
 * Displays readings on LCD display
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define TRIG_PIN 9
#define ECHO_PIN 10
#define GREEN_LED 5
#define YELLOW_LED 6
#define RED_LED 7
#define BUZZER_PIN 8

// Constants for water level calculation
#define MAX_DISTANCE 20      // Maximum distance to measure (cm)
#define MIN_WATER_LEVEL 0    // Minimum water level value when sensor reads MAX_DISTANCE

// Thresholds for alerts (water level in cm)
#define SAFE_THRESHOLD 3.0        // 0-3cm = safe (green)
#define WARNING_THRESHOLD 6.0     // 3.1-6cm = warning (yellow)
// Above 6.1cm = danger (red)

// Variables
long duration;
int distance;
int waterLevel;
unsigned long lastSendTime = 0;
const unsigned long sendInterval = 2000; // Send every 2 seconds
String statusText = "Normal";

// Variables for buzzer control
int buzzerState = LOW;
unsigned long previousBuzzerMillis = 0;
int buzzerInterval = 1000; // Initial interval (will change based on water level)

// Initialize LCD display (0x27 is the default I2C address, change if needed)
// Parameters: (I2C address, columns, rows)
LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  // Initialize pins
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  
  // Initialize serial communication with ESP8266
  Serial.begin(9600);
  
  // Initialize I2C communication
  Wire.begin();
  
  // Initialize LCD
  lcd.init();
  lcd.backlight();
  
  // Display startup message
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Water Level");
  lcd.setCursor(0, 1);
  lcd.print("Monitoring System");
  
  // Wait for serial connection to establish
  delay(2000);
  
  // Flash LEDs to indicate startup
  digitalWrite(GREEN_LED, HIGH);
  delay(300);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(YELLOW_LED, HIGH);
  delay(300);
  digitalWrite(YELLOW_LED, LOW);
  digitalWrite(RED_LED, HIGH);
  delay(300);
  digitalWrite(RED_LED, LOW);
  
  // Clear LCD and show initial status
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Water: ---%");
  lcd.setCursor(0, 1);
  lcd.print("Status: Normal");
}

void loop() {
  // Measure distance
  distance = measureDistance();
  
  // Calculate water level (invert the relationship)
  // If distance is greater than MAX_DISTANCE, set to MAX_DISTANCE
  if (distance > MAX_DISTANCE) {
    distance = MAX_DISTANCE;
  }
  
  // Convert distance to water level percentage (inverted)
  // When distance is MAX_DISTANCE (far), water level is MIN_WATER_LEVEL (0%)
  // When distance is 0 (closest), water level is 100%
  waterLevel = map(distance, MAX_DISTANCE, 0, 0, 100);
  
  // Update display with water level and status
  updateDisplay(waterLevel);
  
  // Update LEDs and buzzer based on water level
  updateIndicators(distance);
  
  // Control buzzer intensity/pattern based on water level
  updateBuzzer(distance);
  
  // Check if it's time to send data to ESP8266
  unsigned long currentMillis = millis();
  
  // Send if interval has passed OR water level has changed to warning/danger level
  if (currentMillis - lastSendTime >= sendInterval || waterLevel >= WARNING_THRESHOLD) {
    lastSendTime = currentMillis;
    
    // Send water level and raw distance to ESP8266
    // Format: "WATER:level:distance"
    Serial.print("WATER:");
    Serial.print(waterLevel);
    Serial.print(":");
    Serial.println(distance);
  }
  
  // Small delay
  delay(100);
}

// Measure distance using ultrasonic sensor
int measureDistance() {
  // Clear the trigger pin
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  
  // Set the trigger pin HIGH for 10 microseconds
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  // Read the echo pin
  duration = pulseIn(ECHO_PIN, HIGH);
  
  // Calculate the distance
  int dist = duration * 0.034 / 2;
  
  return dist;
}

void updateDisplay(int level) {
  // Update water level on LCD with water level visualization
  lcd.setCursor(0, 0);
  lcd.print("Water:[");
  
  // Create a visual bar based on water level (8 segments)
  int barLength = map(level, 0, 100, 0, 8);
  for (int i = 0; i < 8; i++) {
    if (i < barLength) {
      lcd.print("|");
    } else {
      lcd.print(" ");
    }
  }
  lcd.print("]");
  
  // Display percentage on second row
  lcd.setCursor(0, 1);
  lcd.print("Level: ");
  if (level < 10) lcd.print(" "); // Padding for alignment
  if (level < 100) lcd.print(" ");
  lcd.print(level);
  lcd.print("%");
  
  // Set status text based on water level
  lcd.setCursor(11, 1);
  if (level >= WARNING_THRESHOLD) {
    lcd.print("ALERT");
    statusText = "Alert";
  } 
  else if (level >= WARNING_THRESHOLD) {
    lcd.print("WARN ");
    statusText = "Warning";
  }
  else {
    lcd.print("SAFE ");
    statusText = "Safe";
  }
}

void updateIndicators(int distance) {
  // Safe level (green light) - 0 to 3cm
  if (distance <= SAFE_THRESHOLD) {
    digitalWrite(GREEN_LED, HIGH);
    digitalWrite(YELLOW_LED, LOW);
    digitalWrite(RED_LED, LOW);
  } 
  // Warning level (yellow light) - 3.1 to 6cm
  else if (distance > SAFE_THRESHOLD && distance <= WARNING_THRESHOLD) {
    digitalWrite(GREEN_LED, LOW);
    digitalWrite(YELLOW_LED, HIGH);
    digitalWrite(RED_LED, LOW);
  }
  // Alert level (red light) - 6.1cm and up
  else {
    digitalWrite(GREEN_LED, LOW);
    digitalWrite(YELLOW_LED, LOW);
    digitalWrite(RED_LED, HIGH);
  }
}

// New function to control buzzer based on water level
void updateBuzzer(int distance) {
  unsigned long currentMillis = millis();
  
  // Turn off buzzer for safe levels (0-3cm)
  if (distance <= SAFE_THRESHOLD) {
    digitalWrite(BUZZER_PIN, LOW);
    return;
  }
  
  // For warning levels (3.1-6cm), beep with increasing frequency as level rises
  if (distance > SAFE_THRESHOLD && distance <= WARNING_THRESHOLD) {
    // Calculate interval - gets shorter as level increases
    buzzerInterval = map(distance, SAFE_THRESHOLD, WARNING_THRESHOLD, 1000, 200);
    
    // Create intermittent beeping pattern
    if (currentMillis - previousBuzzerMillis >= buzzerInterval) {
      previousBuzzerMillis = currentMillis;
      buzzerState = !buzzerState;
      digitalWrite(BUZZER_PIN, buzzerState);
    }
  }
  
  // For danger levels (>6cm), constant or rapid beeping
  if (distance > WARNING_THRESHOLD) {
    // For extreme danger levels (>15cm), constant sound
    if (distance > 15) {
      digitalWrite(BUZZER_PIN, HIGH);
    } else {
      // Very rapid beeping for high danger
      buzzerInterval = map(distance, WARNING_THRESHOLD, 15, 200, 50);
      
      if (currentMillis - previousBuzzerMillis >= buzzerInterval) {
        previousBuzzerMillis = currentMillis;
        buzzerState = !buzzerState;
        digitalWrite(BUZZER_PIN, buzzerState);
      }
    }
  }
}