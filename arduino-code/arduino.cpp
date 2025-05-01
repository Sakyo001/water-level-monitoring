/* 
 * Water Level Monitor - Arduino
 * Ultrasonic sensor code for water level detection
 * Sends formatted data to ESP8266 via Serial
 */

// Pin definitions
#define TRIG_PIN 9    // Ultrasonic sensor trigger pin
#define ECHO_PIN 10   // Ultrasonic sensor echo pin
#define BUZZER_PIN 7  // Buzzer pin
#define RED_LED_PIN 4    // Red LED for critical water level
#define YELLOW_LED_PIN 3 // Yellow LED for warning water level
#define GREEN_LED_PIN 2  // Green LED for safe water level

// Water level thresholds in cm - match with ESP8266 code
#define SAFE_THRESHOLD_CM 3.0
#define WARNING_THRESHOLD_CM 6.0
#define CRITICAL_THRESHOLD_CM 10.0

// Maximum measurable distance
#define MAX_DISTANCE_CM 20.0

// Time between readings in milliseconds
#define READING_INTERVAL 1000

void setup() {
    // Initialize pins
    pinMode(TRIG_PIN, OUTPUT);
    pinMode(ECHO_PIN, INPUT);
    pinMode(BUZZER_PIN, OUTPUT);
    pinMode(RED_LED_PIN, OUTPUT);
    pinMode(YELLOW_LED_PIN, OUTPUT);
    pinMode(GREEN_LED_PIN, OUTPUT);
    
    // Initial LED test - light up all LEDs briefly
    digitalWrite(RED_LED_PIN, HIGH);
    digitalWrite(YELLOW_LED_PIN, HIGH);
    digitalWrite(GREEN_LED_PIN, HIGH);
    delay(500);
    digitalWrite(RED_LED_PIN, LOW);
    digitalWrite(YELLOW_LED_PIN, LOW);
    digitalWrite(GREEN_LED_PIN, LOW);
    
    // Initialize serial communication with ESP8266
    Serial.begin(9600);
    delay(100);
    
    // Startup message
    Serial.println("Arduino Water Level Monitor");
    Serial.println("Reading ultrasonic sensor distance...");
}

void loop() {
    // Variables for distance measurement
    long duration;
    float distance_cm;
    
    // Clear the trigger pin
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(2);
    
    // Send 10μs pulse to trigger pin
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    
    // Read the echo pin - measure pulse duration
    duration = pulseIn(ECHO_PIN, HIGH);
    
    // Calculate distance in centimeters
    distance_cm = duration * 0.034 / 2.0;
    
    // Display distance in the Arduino Serial Monitor
    Serial.print("Distance: ");
    Serial.print(distance_cm);
    Serial.println(" cm");
    
    // Send formatted data to ESP8266 for Firebase upload
    // This format matches what the ESP8266 code expects
    Serial.print("WATER:");
    Serial.print(distance_cm);
    Serial.println(":AUTO");
    
    // Update status indicators based on water level
    if (distance_cm > 0 && distance_cm <= SAFE_THRESHOLD_CM) {
        // Safe level
        digitalWrite(GREEN_LED_PIN, HIGH);
        digitalWrite(YELLOW_LED_PIN, LOW);
        digitalWrite(RED_LED_PIN, LOW);
        digitalWrite(BUZZER_PIN, LOW); // Buzzer off
    } 
    else if (distance_cm > SAFE_THRESHOLD_CM && distance_cm <= WARNING_THRESHOLD_CM) {
        // Warning level
        digitalWrite(GREEN_LED_PIN, LOW);
        digitalWrite(YELLOW_LED_PIN, HIGH);
        digitalWrite(RED_LED_PIN, LOW);
        // Beep occasionally
        tone(BUZZER_PIN, 1000, 100);
    }
    else if (distance_cm > WARNING_THRESHOLD_CM) {
        // Critical level
        digitalWrite(GREEN_LED_PIN, LOW);
        digitalWrite(YELLOW_LED_PIN, LOW);
        digitalWrite(RED_LED_PIN, HIGH);
        // Continuous beep for critical level
        tone(BUZZER_PIN, 2000, 500);
    }
    else {
        // Invalid reading or sensor error
        digitalWrite(GREEN_LED_PIN, LOW);
        digitalWrite(YELLOW_LED_PIN, LOW);
        digitalWrite(RED_LED_PIN, LOW);
        digitalWrite(BUZZER_PIN, LOW);
    }
    
    // Wait before next reading
    delay(READING_INTERVAL);
}
