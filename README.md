# Water Level Monitoring System

A complete system for monitoring water levels using an ultrasonic sensor, Arduino, ESP8266, and a React web application with Firebase integration.

## Project Structure

- `arduino-code/` - Contains Arduino and ESP8266 code
  - `UltrasonicSensor_Arduino.ino` - Code for Arduino to read ultrasonic sensor
  - `ESP8266_Firebase_Uploader.ino` - Code for ESP8266 to upload data to Firebase
  - `secrets.h` - Your private WiFi and Firebase credentials (not included in repo)
  - `secrets_example.h` - Example template for secrets.h
- `src/` - React web application source code
  - `App.js` - Main React application
  - `firebase.js` - Firebase integration
  - Other React components and styles

## Setup Instructions

### Arduino Setup

1. Open `arduino-code/UltrasonicSensor_Arduino.ino` in Arduino IDE
2. Upload to your Arduino board

### ESP8266 Setup

1. Copy `arduino-code/secrets_example.h` to `arduino-code/secrets.h`
2. Edit `secrets.h` and add your WiFi and Firebase credentials:
   ```cpp
   #define WIFI_SSID "YourWiFiName"
   #define WIFI_PASSWORD "YourWiFiPassword"
   #define FIREBASE_HOST "your-project-id.firebaseio.com"
   #define FIREBASE_AUTH "your-firebase-database-secret"
   ```
3. Open `arduino-code/ESP8266_Firebase_Uploader.ino` in Arduino IDE
4. Install required libraries:
   - FirebaseESP8266
   - NTPClient
   - ESP8266WiFi
5. Upload to your ESP8266 board

### Web Application Setup

1. Copy `.env.example` to `.env`
2. Update `.env` with your Firebase configuration
3. Install dependencies:
   ```
   npm install
   ```
4. Start development server:
   ```
   npm start
   ```
5. Build for production:
   ```
   npm run build
   ```

## Wiring

### Arduino to Ultrasonic Sensor
- Trig Pin: 9
- Echo Pin: 10

### Arduino to ESP8266
- Arduino TX -> ESP8266 RX
- Arduino RX -> ESP8266 TX
- Arduino 5V -> ESP8266 Vin
- Arduino GND -> ESP8266 GND

## Features

- Real-time water level monitoring
- Historical data stored in Firebase
- Water level trend visualization
- Safety recommendations based on water level
- Responsive web interface
- Map integration showing monitoring location

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Important Notes

- Never commit your `secrets.h` or `.env` files to the repository
- They contain sensitive information and are included in `.gitignore`
