#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define TRIG_PIN 9
#define ECHO_PIN 10
#define GREEN_LED 5
#define YELLOW_LED 6
#define RED_LED 7
#define BUZZER_PIN 8

#define MAX_DISTANCE_CM 20

// Thresholds (in cm of water level — increasing as object gets closer)
#define SAFE_THRESHOLD_CM 3.0
#define WARNING_THRESHOLD_CM 6.0

long duration;
int rawDistance;
int waterLevelCM;
bool objectDetected = false;

unsigned long lastSendTime = 0;
const unsigned long sendInterval = 100;
String statusText = "No Object";  // Default status

int buzzerState = LOW;
unsigned long previousBuzzerMillis = 0;
int buzzerInterval = 1000;

LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  Serial.begin(9600);
  Wire.begin();

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("Water Level");
  lcd.setCursor(0, 1);
  lcd.print("Monitoring System");
  delay(2000);

  digitalWrite(GREEN_LED, HIGH); delay(300); digitalWrite(GREEN_LED, LOW);
  digitalWrite(YELLOW_LED, HIGH); delay(300); digitalWrite(YELLOW_LED, LOW);
  digitalWrite(RED_LED, HIGH); delay(300); digitalWrite(RED_LED, LOW);

  lcd.clear();
  showWaitingMessage();  // Display waiting message initially
}

void loop() {
  rawDistance = measureDistance();

  if (objectDetected && rawDistance > MAX_DISTANCE_CM) {
    rawDistance = MAX_DISTANCE_CM;
  }

  if (objectDetected) {
    waterLevelCM = MAX_DISTANCE_CM - rawDistance;
  } else {
    waterLevelCM = 0;
    statusText = "No Object";  // Reset status when nothing is detected
  }

  unsigned long currentMillis = millis();

  if (objectDetected) {
    updateDisplay();
    updateIndicators();
    updateBuzzer();

    if (currentMillis - lastSendTime >= sendInterval) {
      lastSendTime = currentMillis;
      Serial.print("WATER:");
      Serial.print(waterLevelCM);
      Serial.print("cm:");
      Serial.println(statusText);
    }
  } else {
    showWaitingMessage();
    digitalWrite(GREEN_LED, LOW);
    digitalWrite(YELLOW_LED, LOW);
    digitalWrite(RED_LED, LOW);
    digitalWrite(BUZZER_PIN, LOW);

    if (currentMillis - lastSendTime >= sendInterval) {
      lastSendTime = currentMillis;
      Serial.println("WATER:--cm:No Object");  // For completeness
    }
  }

  delay(50);
}

int measureDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    objectDetected = false;  // No object detected
    return MAX_DISTANCE_CM;  // Return max distance to avoid wrong reading
  }

  int dist = duration * 0.034 / 2;

  if (dist < 2 || dist > MAX_DISTANCE_CM) {
    objectDetected = false;  // Invalid distance range, no object
    return MAX_DISTANCE_CM;
  }

  objectDetected = true;  // Object detected with valid distance
  return dist;
}

void updateDisplay() {
  lcd.setCursor(0, 0);
  lcd.print("Water:[");

  int barLength = map(waterLevelCM, 0, MAX_DISTANCE_CM, 0, 8);
  for (int i = 0; i < 8; i++) {
    lcd.print(i < barLength ? "|" : " ");
  }
  lcd.print("]");

  lcd.setCursor(0, 1);
  lcd.print("Dist: ");
  if (waterLevelCM < 10) lcd.print(" ");
  lcd.print(waterLevelCM);
  lcd.print("cm ");

  lcd.setCursor(11, 1);
  if (waterLevelCM > WARNING_THRESHOLD_CM) {
    lcd.print("CRIT ");
    statusText = "Critical";
  } else if (waterLevelCM > SAFE_THRESHOLD_CM) {
    lcd.print("WARN ");
    statusText = "Warning";
  } else {
    lcd.print("SAFE ");
    statusText = "Safe";
  }
}

void showWaitingMessage() {
  lcd.setCursor(0, 0);
  lcd.print("Waiting for      ");
  lcd.setCursor(0, 1);
  lcd.print("object...        ");
}

void updateIndicators() {
  if (waterLevelCM <= SAFE_THRESHOLD_CM) {
    digitalWrite(GREEN_LED, HIGH);
    digitalWrite(YELLOW_LED, LOW);
    digitalWrite(RED_LED, LOW);
  } else if (waterLevelCM <= WARNING_THRESHOLD_CM) {
    digitalWrite(GREEN_LED, LOW);
    digitalWrite(YELLOW_LED, HIGH);
    digitalWrite(RED_LED, LOW);
  } else {
    digitalWrite(GREEN_LED, LOW);
    digitalWrite(YELLOW_LED, LOW);
    digitalWrite(RED_LED, HIGH);
  }
}

void updateBuzzer() {
  unsigned long currentMillis = millis();

  if (waterLevelCM <= SAFE_THRESHOLD_CM) {
    digitalWrite(BUZZER_PIN, LOW);
    return;
  }

  if (waterLevelCM <= WARNING_THRESHOLD_CM) {
    buzzerInterval = map(waterLevelCM, (int)SAFE_THRESHOLD_CM, (int)WARNING_THRESHOLD_CM, 1000, 200);
    if (currentMillis - previousBuzzerMillis >= buzzerInterval) {
      previousBuzzerMillis = currentMillis;
      buzzerState = !buzzerState;
      digitalWrite(BUZZER_PIN, buzzerState);
    }
  } else {
    if (waterLevelCM > 15) {
      digitalWrite(BUZZER_PIN, HIGH);
    } else {
      buzzerInterval = map(waterLevelCM, (int)WARNING_THRESHOLD_CM, 15, 200, 50);
      if (currentMillis - previousBuzzerMillis >= buzzerInterval) {
        previousBuzzerMillis = currentMillis;
        buzzerState = !buzzerState;
        digitalWrite(BUZZER_PIN, buzzerState);
      }
    }
  }
}
