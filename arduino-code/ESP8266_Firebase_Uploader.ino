/*
 * ESP8266 Firebase Uploader for Water Level Monitoring
 * Receives distance data from Arduino via Serial
 * Uploads data to Firebase Realtime Database
 */

#include <ESP8266WiFi.h>
#include <FirebaseESP8266.h>
#include <NTPClient.h>
#include <WiFiUdp.h>

// Include secrets.h for WiFi and Firebase credentials
// Create a secrets.h file with your actual credentials
// Use secrets_example.h as a template
#include "secrets.h"

// Status LED
#define LED_PIN D4  // Built-in LED on most ESP8266 boards

// Firebase objects
FirebaseData firebaseData;
FirebaseAuth auth;
FirebaseConfig config;

// NTP Client to get time
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org");

// Status variables
bool isWifiConnected = false;
bool isFirebaseConnected = false;
unsigned long lastUploadTime = 0;
String lastWaterLevel = "";
String lastStatus = "";
String deviceId = "ultrasonic-sensor-1";

void setup() {
  // Initialize serial communication with Arduino
  Serial.begin(9600);
  
  // Initialize LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);  // LED off (inverted logic on NodeMCU)
  
  // Connect to Wi-Fi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  // Wait for Wi-Fi connection
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 30) {
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));  // Toggle LED
    delay(300);
    wifiAttempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    isWifiConnected = true;
    digitalWrite(LED_PIN, LOW);  // LED on when connected
    
    // Initialize NTP Client
    timeClient.begin();
    timeClient.setTimeOffset(0); // Adjust to your timezone in seconds if needed
    timeClient.update();
    
    // Initialize Firebase
    config.host = FIREBASE_HOST;
    config.signer.tokens.legacy_token = FIREBASE_AUTH;
    
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
    
    if (Firebase.ready()) {
      isFirebaseConnected = true;
      
      // Log ESP8266 has started
      logToFirebase("ESP8266 Water Level Monitor connected");
    }
  }
}

void loop() {
  // Update NTP time regularly
  if (WiFi.status() == WL_CONNECTED) {
    timeClient.update();
  }
  
  // Read data from Arduino if available
  if (Serial.available() > 0) {
    String data = Serial.readStringUntil('\n');
    
    // Check if it's water level data (format: WATER:level:distance)
    if (data.startsWith("WATER:")) {
      // Extract water level and raw distance values
      int separatorPos = data.indexOf(':', 6);
      
      if (separatorPos > 0) {
        // Parse water level (percentage)
        int waterLevel = data.substring(6, separatorPos).toInt();
        
        // Parse raw distance (cm)
        int rawDistance = data.substring(separatorPos + 1).toInt();
        
        // Determine status based on water level percentage
        String status;
        if (waterLevel >= 90) {
          status = "Danger";  // Red light
        } else if (waterLevel >= 60) {
          status = "Warning";  // Yellow light
        } else {
          status = "Safe";  // Green light
        }
      
        // Upload to Firebase if connected
        if (isWifiConnected && isFirebaseConnected) {
          uploadWaterLevel(waterLevel, rawDistance, status);
        }
      }
    }
  }
  
  // Check WiFi connection periodically
  static unsigned long lastWifiCheck = 0;
  if (millis() - lastWifiCheck > 30000) {  // Check every 30 seconds
    lastWifiCheck = millis();
    
    if (WiFi.status() != WL_CONNECTED) {
      isWifiConnected = false;
      digitalWrite(LED_PIN, HIGH);  // LED off when disconnected
      
      // Try to reconnect
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      
      // Wait briefly for connection
      delay(5000);
      
      if (WiFi.status() == WL_CONNECTED) {
        isWifiConnected = true;
        digitalWrite(LED_PIN, LOW);  // LED on when connected
        
        // Update time after reconnecting
        timeClient.update();
      }
    }
  }
}

// Upload water level data to Firebase
void uploadWaterLevel(int waterLevel, int rawDistance, String status) {
  // Get the current timestamp from NTP
  unsigned long timestamp = (unsigned long)timeClient.getEpochTime() * 1000L; // Convert to milliseconds
  
  // Blink LED to indicate upload attempt
  digitalWrite(LED_PIN, HIGH);  // LED off
  
  // Upload to Firebase
  bool success = true;
  
  // Create a unique entry path using timestamp
  String path = "/waterLevelData/" + String(timestamp);
  
  // Upload each field separately
  success &= Firebase.setInt(firebaseData, path + "/waterLevel", waterLevel);
  success &= Firebase.setInt(firebaseData, path + "/distance", rawDistance);
  success &= Firebase.setString(firebaseData, path + "/status", status);
  success &= Firebase.setString(firebaseData, path + "/deviceId", deviceId);
  success &= Firebase.setInt(firebaseData, path + "/timestamp", timestamp);
  
  // Also update current water level (most recent reading)
  success &= Firebase.setInt(firebaseData, "/currentWaterLevel/waterLevel", waterLevel);
  success &= Firebase.setInt(firebaseData, "/currentWaterLevel/distance", rawDistance);
  success &= Firebase.setString(firebaseData, "/currentWaterLevel/status", status);
  success &= Firebase.setInt(firebaseData, "/currentWaterLevel/timestamp", timestamp);
  
  if (success) {
    // LED quick blink pattern for success
    for (int i = 0; i < 3; i++) {
      digitalWrite(LED_PIN, LOW);  // LED on
      delay(50);
      digitalWrite(LED_PIN, HIGH);  // LED off
      delay(50);
    }
  } else {
    // LED slow blink pattern for failure
    for (int i = 0; i < 2; i++) {
      digitalWrite(LED_PIN, LOW);  // LED on
      delay(200);
      digitalWrite(LED_PIN, HIGH);  // LED off
      delay(200);
    }
  }
  
  // LED back on to indicate ready state
  digitalWrite(LED_PIN, LOW);  // LED on
}

// Log a message to Firebase
void logToFirebase(String message) {
  if (!isWifiConnected || !isFirebaseConnected) {
    return;
  }
  
  unsigned long timestamp = timeClient.getEpochTime() * 1000; // Convert to milliseconds
  String path = "/systemLogs/" + String(timestamp);
  Firebase.setString(firebaseData, path + "/message", message);
  Firebase.setInt(firebaseData, path + "/timestamp", timestamp);
} 