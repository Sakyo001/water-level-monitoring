# Water Level Monitoring System - Wiring Instructions

This document explains how to wire the complete water level monitoring system with Arduino, ESP8266, ultrasonic sensor, LCD display, LEDs, and buzzer.

## Components Needed

1. Arduino board (Uno/Nano/etc.)
2. ESP8266 module (NodeMCU or Wemos D1 Mini)
3. HC-SR04 Ultrasonic Sensor
4. 16x2 LCD Display with I2C adapter
5. 3 LEDs (Green, Yellow, Red)
6. Buzzer
7. 3 x 220Ω resistors (for LEDs)
8. Jumper wires
9. Breadboard

## Wiring Diagram

### 1. Arduino Connections

#### Ultrasonic Sensor to Arduino
- VCC → 5V on Arduino
- GND → GND on Arduino
- TRIG → Pin 9 on Arduino
- ECHO → Pin 10 on Arduino

#### LCD Display to Arduino
- VCC → 5V on Arduino
- GND → GND on Arduino
- SDA → A4 on Arduino (SDA pin)
- SCL → A5 on Arduino (SCL pin)

#### LEDs to Arduino 
- Green LED:
  - Anode (+) → 220Ω resistor → Pin 5 on Arduino
  - Cathode (-) → GND
- Yellow LED:
  - Anode (+) → 220Ω resistor → Pin 6 on Arduino
  - Cathode (-) → GND
- Red LED:
  - Anode (+) → 220Ω resistor → Pin 7 on Arduino
  - Cathode (-) → GND

#### Buzzer to Arduino
- Positive (+) → Pin 8 on Arduino
- Negative (-) → GND

### 2. Serial Connection Between Arduino and ESP8266

**Important:** Disconnect these connections when uploading code!

- Arduino TX (Pin 1) → ESP8266 RX (RX pin)
- Arduino RX (Pin 0) → ESP8266 TX (TX pin)
- Arduino GND → ESP8266 GND

### 3. Power for ESP8266

Connect "G" (on ESP8266) to GND (on Arduino)
Connect "RX" (on ESP8266) to TX (Pin 1 on Arduino)
Connect "TX" (on ESP8266) to RX (Pin 0 on Arduino)
Connect "VIN" (on ESP8266) to 5V (on Arduino)

## Upload Instructions

1. **Disconnect the TX/RX wires** between Arduino and ESP8266
2. Upload sketch to Arduino first: `UltrasonicSensor_Arduino.ino`
3. Upload sketch to ESP8266: `ESP8266_Firebase_Uploader.ino`
4. Reconnect the TX/RX wires after uploading both sketches

## Ultrasonic Sensor Placement

The ultrasonic sensor should be mounted above the water or container, pointing downward. Since the system now displays water level as a percentage:

- When the water container is empty, the sensor reads maximum distance and shows 0% water level
- As water rises in the container, it gets closer to the sensor, and the water level percentage increases
- When water reaches near the sensor, it shows 100% water level

## Expected Behavior

### LCD Display
The LCD now shows a visual representation of the water level:
- Top line: Water level bar graph that fills from left to right as water rises
- Bottom line: Numeric percentage and status (SAFE, WARN, ALERT)

### LED Indicators
- Green LED: ON when water level is below 30% (SAFE)
- Yellow LED: ON when water level is between 30-90% (WARNING)
- Red LED: ON when water level is above 90% (DANGER)

### Buzzer Behavior
The buzzer provides progressive alerts based on water level:
- Silent when water level is below 30% (SAFE zone)
- Slow beeping when water level is at 30% (beginning of WARNING zone)
- Increasingly faster beeping as water level rises through WARNING zone
- Rapid beeping when water level reaches DANGER zone (90%)
- Continuous sound when water level exceeds 95% (extreme danger)

## Testing

1. After connecting everything and uploading both sketches:
   - The ESP8266 LED should blink while connecting to WiFi, then stay on
   - The Arduino LEDs should indicate the water level status
   - The LCD display should show the water level visualization and percentage

2. Test the system by gradually bringing an object closer to the ultrasonic sensor:
   - Far from sensor (>10cm): Green LED on, low percentage on LCD, no sound
   - Moving closer (~7-9cm): Yellow LED on, LCD shows increasing bar graph and percentage, buzzer begins slow beeping
   - Very close to sensor (<2cm): Red LED on, LCD shows nearly full bar graph and high percentage, buzzer sounds continuously

3. Check Firebase console to see the water level data being uploaded. The data now includes:
   - waterLevel (percentage value)
   - distance (raw distance in cm)
   - status (Safe/Warning/Danger)

## Troubleshooting

- If ESP8266 LED is not turning on, check WiFi credentials
- If data isn't showing in Firebase, check Firebase credentials
- If Arduino isn't sending data, check Serial connection between Arduino and ESP8266
- If ultrasonic sensor isn't working:
  - Check wiring connections
  - Make sure there are no obstructions blocking the sensor
  - Ensure the sensor is properly aligned with the water surface
- If LCD display is not working:
  - Check I2C address (typical is 0x27 or 0x3F)
  - Make sure the I2C adapter is properly connected
  - Verify that you have the LiquidCrystal_I2C library installed
- If buzzer is not working:
  - Check wiring connections
  - Try swapping the positive and negative connections
  - Ensure the code is correctly setting the buzzer pin

## Circuit Diagram

```
Arduino                        ESP8266 (NodeMCU)
┌───────────┐                  ┌───────────┐
│           │                  │           │
│        TX ├──────────────────┤ RX        │
│        RX ├──────────────────┤ TX        │
│       GND ├──────────────────┤ GND       │
│        5V ├──────────────────┤ VIN       │
│           │                  │           │
│        A4 ├────┐             │           │
│        A5 ├──┐ │             │           │
│      PIN9 ├─┐│ │             │           │
│     PIN10 ├┐││ │             │           │
│      PIN5 ├┘││ │             │           │
│      PIN6 ├─┘│ │             │           │
│      PIN7 ├──┘ │             │           │
│      PIN8 ├────┘             └───────────┘
└───────────┘
              │ │ │ │          HC-SR04
              │ │ │ │          ┌───────────┐
              │ │ │ └──────────┤ TRIG      │
              │ │ └────────────┤ ECHO      │
              │ │              │ VCC       │
              │ │              │ GND       │
              │ │              └───┬───┬───┘
              │ │                  │   │
              │ │                  │   │
              │ │                  │   │
             ┌┴─┴┐              ┌──┴───┴──┐
             │220│              │         │
             │ Ω │              │   5V    │
             └┬─┬┘              │         │
              │ │               │   GND   │
              │ │               └────┬────┘
             ┌┴─┴┐                   │
             │LED│                   │
             │GRN│                   │
             └┬─┬┘                   │
              │ │                    │
              │ └────────────────────┘
             ┌┴─┴┐
             │220│
             │ Ω │
             └┬─┬┘
              │ │
             ┌┴─┴┐
             │LED│
             │YEL│
             └┬─┬┘
              │ │
              │ └────────────────────┐
             ┌┴─┴┐                   │
             │220│                   │
             │ Ω │                   │
             └┬─┬┘                   │
              │ │                    │
             ┌┴─┴┐                   │
             │LED│                   │
             │RED│                   │
             └┬─┬┘                   │
              │ │                    │
              │ └────────────────────┘
             ┌┴─┴┐
             │BUZ│
             │ZER│
             └┬─┬┘
              │ │
              │ └────────────────────┘

      LCD Display (I2C)
      ┌───────────────┐
      │               │
      │               │
      │ GND VCC SDA SCL
      └──┬──┬───┬───┬─┘
         │  │   │   │
         │  │   │   └───────────┐
         │  │   └───────────┐   │
         │  └───────────┐   │   │
         │              │   │   │
         └──────────────┼───┼───┘
                        │   │
                   ┌────┘   │
                   │        │
                   │      ┌─┘
                   │      │
               Arduino A4 A5
``` 