/*
 * ESP8266 Firebase Uploader for Water Level Monitoring
 * Receives distance data from Arduino via Serial
 * Uploads data to Firebase Realtime Database
 */

#include <ESP8266WiFi.h>
#include <FirebaseESP8266.h>
#include <NTPClient.h>
#include <WiFiUdp.h>

// WiFi credentials
#define WIFI_SSID "macky"
#define WIFI_PASSWORD "Macky12345678."

// Firebase credentials
#define FIREBASE_HOST "water-level-monitoring-new-default-rtdb.firebaseio.com"
#define FIREBASE_AUTH "AIzaSyC-rk_aYFLqEdO7znZFELh4-t0c0bYa35Q"

// Water level thresholds in cm
#define SAFE_THRESHOLD_CM 3.0
#define WARNING_THRESHOLD_CM 6.0
#define CRITICAL_THRESHOLD_CM 10.0

// Maximum distance for water level measurements in cm
// This must match MAX_DISTANCE_CM in the Arduino code for percentage calculations
#define MAX_DISTANCE_CM 20.0

// Maximum distance to report to Firebase - values above this will be capped
#define REPORT_MAX_DISTANCE_CM 8.0

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
String deviceId = "ultrasonic-sensor-1";
unsigned long lastSuccessfulUpload = 0;

void setup() {
  // Initialize serial communication with Arduino at higher baud rate for faster data transfer
  Serial.begin(9600);
  Serial.println("\n\nESP8266 Water Level Monitor Starting...");
  Serial.println("Version: High-Frequency Upload");
  Serial.println("Maximum distance set to: " + String(MAX_DISTANCE_CM) + "cm");
  Serial.println("Maximum reported distance: " + String(REPORT_MAX_DISTANCE_CM) + "cm");
  
  // Initialize LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);  // LED off (inverted logic on NodeMCU)
  
  // Connect to Wi-Fi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to WiFi");
  
  // Wait for Wi-Fi connection
  int wifiAttempts = 0;
  while (WiFi.status() != WL_CONNECTED && wifiAttempts < 30) {
    delay(500);
    Serial.print(".");
    wifiAttempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    isWifiConnected = true;
    Serial.println();
    Serial.println("WiFi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    
    // Initialize NTP Client
    timeClient.begin();
    timeClient.setTimeOffset(0); // Adjust to your timezone in seconds if needed
    timeClient.update();
    
    // Initialize Firebase
    config.host = FIREBASE_HOST;
    config.signer.tokens.legacy_token = FIREBASE_AUTH;
    
    Firebase.begin(&config, &auth);
    Firebase.reconnectWiFi(true);
    
    // Optimize for higher frequency uploads
    firebaseData.setBSSLBufferSize(512, 2048);
    firebaseData.setResponseSize(1024);
    
    if (Firebase.ready()) {
      isFirebaseConnected = true;
      Serial.println("Firebase connected successfully!");
      
      // Log ESP8266 has started with high-frequency configuration
      logToFirebase("ESP8266 Water Level Monitor connected - High-Frequency Upload Mode");
      
      // Log threshold settings and maximum distance
      String thresholdsMsg = "Thresholds set: Safe(0-" + String(SAFE_THRESHOLD_CM) + 
                            "cm), Warning(" + String(SAFE_THRESHOLD_CM) + "-" + 
                            String(WARNING_THRESHOLD_CM) + "cm), Critical(" + 
                            String(WARNING_THRESHOLD_CM) + "-" + 
                            String(CRITICAL_THRESHOLD_CM) + "cm)";
      logToFirebase(thresholdsMsg);
      
      // Log max distance setting
      logToFirebase("Using maximum distance of " + String(MAX_DISTANCE_CM) + "cm for calculations");
      logToFirebase("Maximum reported distance capped at " + String(REPORT_MAX_DISTANCE_CM) + "cm");
    } else {
      Serial.println("Firebase connection failed!");
    }
  } else {
    Serial.println();
    Serial.println("WiFi connection failed!");
  }
}

void loop() {
  // Update NTP time regularly
  if (WiFi.status() == WL_CONNECTED) {
    timeClient.update();
  }
  
  // Process all available Serial data immediately for faster detection
  while (Serial.available() > 0) {
    String data = Serial.readStringUntil('\n');
    
    // Process data only if it's valid water level data
    if (data.startsWith("WATER:")) {
      int firstSeparator = data.indexOf(':', 6);
      
      if (firstSeparator > 0) {
        // Parse water level
        String waterLevelString = data.substring(6, firstSeparator);
        float waterLevelCM = 0;
        
        if (waterLevelString != "--") {
          waterLevelCM = waterLevelString.toFloat();
        }
        
        // Extract status from the data - after the second colon
        int secondSeparator = data.indexOf(':', firstSeparator + 1);
        String status = "";
        
        if (secondSeparator > 0) {
          status = data.substring(secondSeparator + 1);
        } else {
          // Determine status based on water level in cm with updated thresholds
          if (waterLevelCM <= SAFE_THRESHOLD_CM) {
            status = "Safe";
          } else if (waterLevelCM <= WARNING_THRESHOLD_CM) {
            status = "Warning";
          } else if (waterLevelCM <= CRITICAL_THRESHOLD_CM) {
            status = "Critical";
          } else {
            // For levels above CRITICAL_THRESHOLD_CM
            status = "Critical";
          }
        }
        
        // Convert to water level percentage - ensure we use MAX_DISTANCE_CM as the denominator
        int waterLevelPercent = 0;
        if (waterLevelCM > 0) {
          waterLevelPercent = (waterLevelCM / MAX_DISTANCE_CM) * 100;
          // Ensure it's capped at 100
          if (waterLevelPercent > 100) waterLevelPercent = 100;
        }
        
        // Cap the reported distance to REPORT_MAX_DISTANCE_CM for Firebase
        float reportedWaterLevelCM = waterLevelCM;
        if (reportedWaterLevelCM > REPORT_MAX_DISTANCE_CM) {
          reportedWaterLevelCM = REPORT_MAX_DISTANCE_CM;
        }
        
        // Upload to Firebase immediately if connected
        if (isWifiConnected && isFirebaseConnected) {
          // For testing and debugging, add this line to see the raw and percentage values
          Serial.print("Raw CM: ");
          Serial.print(waterLevelCM);
          if (waterLevelCM != reportedWaterLevelCM) {
            Serial.print("cm (capped to ");
            Serial.print(reportedWaterLevelCM);
            Serial.print("cm)");
          } else {
            Serial.print("cm");
          }
          Serial.print(" (");
          Serial.print(waterLevelPercent);
          Serial.print("%)");
          Serial.println();
          
          uploadWaterLevel(waterLevelPercent, reportedWaterLevelCM, status);
        } else {
          Serial.println("Cannot upload - WiFi or Firebase not connected");
          // Try to reconnect immediately if needed
          checkAndReconnectWiFi();
        }
      }
    }
  }
  
  // Check WiFi connection periodically, but not too often
  static unsigned long lastWifiCheck = 0;
  if (millis() - lastWifiCheck > 15000) {  // Check every 15 seconds
    lastWifiCheck = millis();
    checkAndReconnectWiFi();
  }
}

// Function to check and reconnect WiFi
void checkAndReconnectWiFi() {
  if (WiFi.status() != WL_CONNECTED) {
    isWifiConnected = false;
    Serial.println("WiFi disconnected! Attempting to reconnect...");
    
    // Try to reconnect
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    
    // Wait briefly for connection
    int reconnectAttempts = 0;
    while (WiFi.status() != WL_CONNECTED && reconnectAttempts < 10) {
      delay(500);
      Serial.print(".");
      reconnectAttempts++;
    }
    Serial.println();
    
    if (WiFi.status() == WL_CONNECTED) {
      isWifiConnected = true;
      Serial.println("WiFi reconnected successfully");
      
      // Update time after reconnecting
      timeClient.update();
    } else {
      Serial.println("WiFi reconnection failed");
    }
  }
}

// Upload water level data to Firebase
void uploadWaterLevel(int waterLevelPercent, float waterLevelCM, String status) {
  // Get the current timestamp from NTP
  unsigned long timestamp = (unsigned long)timeClient.getEpochTime() * 1000L; // Convert to milliseconds
  
  // Calculate time since last successful upload for debug info
  unsigned long timeSinceLastUpload = timestamp - lastSuccessfulUpload;
  
  // Create a unique entry path using timestamp
  String path = "/waterLevelData/" + String(timestamp);
  
  // Upload to Firebase with optimized approach - set multiple data at once
  bool success = true;
  
  // Create JSON object with multiple fields to reduce number of HTTP requests
  FirebaseJson json;
  json.set("waterLevel", waterLevelPercent);
  json.set("distance", waterLevelCM);
  json.set("status", status);
  json.set("deviceId", deviceId);
  json.set("timestamp", timestamp);
  
  // Upload the entire JSON object in one request
  if (Firebase.setJSON(firebaseData, path, json)) {
    Serial.print("Upload successful: ");
    Serial.print(waterLevelCM);
    Serial.print("cm, Status: ");
    Serial.println(status);
    
    // Also update current water level (most recent reading)
    Firebase.setJSON(firebaseData, "/currentWaterLevel", json);
    
    // Update last successful upload time
    lastSuccessfulUpload = timestamp;
  } else {
    Serial.print("Upload failed: ");
    Serial.println(firebaseData.errorReason());
  }
}

// Log a message to Firebase
void logToFirebase(String message) {
  if (!isWifiConnected || !isFirebaseConnected) {
    return;
  }
  
  unsigned long timestamp = timeClient.getEpochTime() * 1000; // Convert to milliseconds
  
  FirebaseJson json;
  json.set("message", message);
  json.set("timestamp", timestamp);
  
  String path = "/systemLogs/" + String(timestamp);
  Firebase.setJSON(firebaseData, path, json);
} 