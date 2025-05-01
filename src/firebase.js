// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase, ref, onValue, push, set, get, query, orderByChild, limitToLast } from "firebase/database";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "AIzaSyCn78CVEM5Q26Bi-8kFTWyHNqMRQlS9m7I",
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || "water-level-3.firebaseapp.com",
  databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL || "https://water-level-3-default-rtdb.firebaseio.com",
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || "water-level-3",
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || "water-level-3.firebasestorage.app",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || "939429097460",
  appId: process.env.REACT_APP_FIREBASE_APP_ID || "1:939429097460:web:deaad210012074bc7953a1",
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID || "G-6WS8QWLBLR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const database = getDatabase(app);

// Helper function to determine status based on water level percentage
function getStatusFromWaterLevel(waterLevel) {
  const level = parseFloat(waterLevel);
  if (level >= 90) return "Danger";
  if (level >= 60) return "Warning";
  return "Safe";
}

// Helper function to fix ESP8266 timestamps
function fixTimestamp(timestamp) {
  // First, check if it's a reasonably recent timestamp in milliseconds
  // (roughly from 2020 onwards: 1577836800000)
  if (timestamp > 1577836800000) {
    return timestamp; // Already in milliseconds and recent
  }

  // Check if it's a reasonably recent timestamp in seconds
  // (roughly from 2020 onwards: 1577836800)
  if (timestamp > 1577836800 && timestamp < 2000000000) {
    return timestamp * 1000; // Convert seconds to milliseconds
  }

  // ESP8266 NTP timestamps might be seconds since boot
  // In this case, use the current time
  const now = Date.now();
  console.log("Using current time instead of invalid timestamp:", timestamp);
  return now;
}

// Function to record ultrasonic sensor reading
export const recordWaterLevelReading = async (reading) => {
  try {
    // Add timestamp if not present
    if (!reading.timestamp) {
      reading.timestamp = Date.now();
    }
    
    // Make sure the timestamp is a number
    if (typeof reading.timestamp === 'string') {
      reading.timestamp = parseInt(reading.timestamp, 10);
    }
    
    // Make sure water level value is present
    if (reading.waterLevel === undefined && reading.distance === undefined) {
      console.error('Error: Either waterLevel or distance value is required');
      return false;
    }
    
    // If only distance is provided, calculate water level (if not already present)
    if (reading.waterLevel === undefined && reading.distance !== undefined) {
      // Assuming MAX_DISTANCE is 15cm, same as in Arduino code
      const MAX_DISTANCE = 15;
      const distance = parseFloat(reading.distance);
      reading.waterLevel = Math.max(0, Math.min(100, Math.round(100 - (distance / MAX_DISTANCE * 100))));
    }
    
    // Ensure we're storing values as numbers
    reading.waterLevel = parseFloat(reading.waterLevel);
    if (reading.distance !== undefined) {
      reading.distance = parseFloat(reading.distance);
    }
    
    // Set status if not provided
    if (!reading.status) {
      reading.status = getStatusFromWaterLevel(reading.waterLevel);
    }
    
    console.log('Recording to Firebase:', reading);
    
    // Add the current reading to waterLevelData
    const newReadingRef = push(ref(database, 'waterLevelData'));
    await set(newReadingRef, reading);
    
    // Also update the currentWaterLevel
    await set(ref(database, 'currentWaterLevel'), {
      waterLevel: reading.waterLevel,
      distance: reading.distance,
      timestamp: reading.timestamp,
      status: reading.status,
      deviceId: reading.deviceId || 'unknown'
    });
    
    return true;
  } catch (error) {
    console.error('Error recording water level:', error);
    return false;
  }
};

// Function to directly fetch current water level data
export const getCurrentWaterLevel = async () => {
  try {
    const snapshot = await get(ref(database, 'currentWaterLevel'));
    if (snapshot.exists()) {
      const data = snapshot.val();
      console.log("Direct fetch of currentWaterLevel:", data);
      
      // Ensure the data has waterLevel (might be from old format)
      let waterLevel = data.waterLevel;
      if (waterLevel === undefined && data.distance !== undefined) {
        // Convert legacy format if needed
        const MAX_DISTANCE = 15;
        const distance = parseFloat(data.distance);
        waterLevel = Math.max(0, Math.min(100, Math.round(100 - (distance / MAX_DISTANCE * 100))));
      }
      
      return {
        id: 'current-reading',
        waterLevel: parseFloat(waterLevel),
        distance: data.distance !== undefined ? parseFloat(data.distance) : null,
        timestamp: data.timestamp,
        deviceId: data.deviceId || 'unknown',
        status: data.status || getStatusFromWaterLevel(waterLevel)
      };
    }
    return null;
  } catch (error) {
    console.error("Error fetching current water level:", error);
    return null;
  }
};

// Function to subscribe to water level updates
export const subscribeToWaterLevelUpdates = (callback) => {
  console.log('Setting up Firebase subscriptions...');
  
  // Track last update time to prevent too frequent updates
  let lastUpdateTime = 0;
  let pendingUpdate = null;
  let pendingUpdateTimer = null;
  const UPDATE_DEBOUNCE_TIME = 2000; // 2 seconds debounce

  // Create a debounced callback to prevent flickering
  const debouncedCallback = (data) => {
    // Clear any pending update
    if (pendingUpdateTimer) {
      clearTimeout(pendingUpdateTimer);
    }
    
    // Store the latest data
    pendingUpdate = data;
    
    // Only send updates at most once every UPDATE_DEBOUNCE_TIME milliseconds
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;
    
    if (timeSinceLastUpdate >= UPDATE_DEBOUNCE_TIME) {
      // We can update immediately
      lastUpdateTime = now;
      callback([...pendingUpdate]);
      pendingUpdate = null;
    } else {
      // Schedule update for later
      const timeToWait = UPDATE_DEBOUNCE_TIME - timeSinceLastUpdate;
      pendingUpdateTimer = setTimeout(() => {
        lastUpdateTime = Date.now();
        callback([...pendingUpdate]);
        pendingUpdate = null;
        pendingUpdateTimer = null;
      }, timeToWait);
    }
  };
  
  // Immediately try to get current water level
  getCurrentWaterLevel().then(currentReading => {
    if (currentReading) {
      // Fix timestamp if needed
      currentReading.timestamp = fixTimestamp(currentReading.timestamp);
      console.log("Initial current reading (fixed timestamp):", currentReading);
      lastUpdateTime = Date.now();
      callback([currentReading]);
    }
  });
  
  // Create a single array to hold all readings
  let allReadings = [];
  
  // Subscribe to currentWaterLevel for real-time updates
  const currentWaterLevelRef = ref(database, 'currentWaterLevel');
  const currentUnsubscribe = onValue(currentWaterLevelRef, (snapshot) => {
    console.log('Current water level updated:', snapshot.val());
    
    if (snapshot.exists()) {
      const currentData = snapshot.val();
      
      // Validate data has required fields
      if ((currentData.waterLevel !== undefined || currentData.distance !== undefined) && currentData.timestamp) {
        try {
          // If we only have distance, calculate water level
          let waterLevel = currentData.waterLevel;
          if (waterLevel === undefined && currentData.distance !== undefined) {
            // Convert legacy format if needed
            const MAX_DISTANCE = 15;
            const distance = parseFloat(currentData.distance);
            waterLevel = Math.max(0, Math.min(100, Math.round(100 - (distance / MAX_DISTANCE * 100))));
          }
          
          // Create a valid reading object
          const currentReading = {
            id: 'current-reading',
            waterLevel: typeof waterLevel === 'number' ? 
              waterLevel : parseFloat(waterLevel),
            distance: currentData.distance !== undefined ? 
              parseFloat(currentData.distance) : null,
            timestamp: fixTimestamp(typeof currentData.timestamp === 'number' ? 
              currentData.timestamp : parseInt(currentData.timestamp, 10)),
            deviceId: currentData.deviceId || 'unknown',
            status: currentData.status || getStatusFromWaterLevel(waterLevel)
          };
          
          console.log("Processed current reading:", currentReading);
          
          // Validate the reading has valid data
          if (!isNaN(currentReading.waterLevel)) {
            
            // If we have no readings yet, just use this one
            if (allReadings.length === 0) {
              allReadings = [currentReading];
              console.log("First reading received, sending to app:", allReadings);
              debouncedCallback([...allReadings]);
              return;
            }
            
            // Update the current reading in our array or add it
            const currentIndex = allReadings.findIndex(r => r.id === 'current-reading');
            if (currentIndex >= 0) {
              allReadings[currentIndex] = currentReading;
            } else {
              allReadings.unshift(currentReading);
            }
            
            // Sort by timestamp (newest first)
            allReadings.sort((a, b) => b.timestamp - a.timestamp);
            
            console.log("Sending updated readings to app:", allReadings.length);
            // Notify the callback with debouncing
            debouncedCallback([...allReadings]);
          } else {
            console.error("Invalid water level value:", currentReading.waterLevel);
          }
        } catch (error) {
          console.error("Error processing current water level:", error);
        }
      } else {
        console.warn("Current water level data missing required fields:", currentData);
      }
    } else {
      console.warn("No current water level data exists");
    }
  });
  
  // Create a query for waterLevelData
  const waterLevelDataRef = ref(database, 'waterLevelData');
  
  // Subscribe to waterLevelData changes
  const historyUnsubscribe = onValue(waterLevelDataRef, (snapshot) => {
    console.log('Water level history updated');
    
    if (snapshot.exists()) {
      try {
        const data = snapshot.val();
        
        // Convert the data object to an array
        const dataArray = Object.keys(data).map(key => {
          try {
            const entry = data[key];
            
            // Fix timestamp if needed
            const fixedTimestamp = fixTimestamp(
              typeof entry.timestamp === 'number' ? 
                entry.timestamp : parseInt(entry.timestamp, 10)
            );
            
            // Handle legacy entries that only have distance
            let waterLevel = entry.waterLevel;
            if (waterLevel === undefined && entry.distance !== undefined) {
              const MAX_DISTANCE = 15;
              const distance = parseFloat(entry.distance);
              waterLevel = Math.max(0, Math.min(100, Math.round(100 - (distance / MAX_DISTANCE * 100))));
            }
            
            return {
              id: key,
              waterLevel: typeof waterLevel === 'number' ? 
                waterLevel : parseFloat(waterLevel),
              distance: entry.distance !== undefined ? 
                parseFloat(entry.distance) : null,
              timestamp: fixedTimestamp,
              deviceId: entry.deviceId || 'unknown',
              status: entry.status || getStatusFromWaterLevel(waterLevel)
            };
          } catch (error) {
            console.error("Error processing entry:", error, data[key]);
            return null;
          }
        }).filter(entry => entry !== null);
        
        // Filter out entries with invalid waterLevel
        const validEntries = dataArray.filter(reading => 
          reading.waterLevel !== undefined && !isNaN(reading.waterLevel)
        );
        
        console.log(`Found ${validEntries.length} valid readings in waterLevelData`);
        
        if (validEntries.length > 0) {
          // Sort by timestamp (newest first)
          validEntries.sort((a, b) => b.timestamp - a.timestamp);
          
          // Keep the current reading at the top if we have one
          const currentReading = allReadings.find(r => r.id === 'current-reading');
          
          if (currentReading) {
            allReadings = [currentReading, ...validEntries.filter(r => r.id !== 'current-reading')];
          } else {
            allReadings = validEntries;
          }
          
          console.log("Sending combined readings to app:", allReadings.length);
          // Notify the callback with debouncing
          debouncedCallback([...allReadings]);
        }
      } catch (error) {
        console.error("Error processing water level history:", error);
      }
    } else {
      console.log('No data found in waterLevelData');
    }
  });
  
  // Return a function to unsubscribe from both listeners and clear any pending updates
  return () => {
    currentUnsubscribe();
    historyUnsubscribe();
    if (pendingUpdateTimer) {
      clearTimeout(pendingUpdateTimer);
    }
  };
};

// Function to record minute by minute graph data
export const recordMinuteByMinuteData = async (reading) => {
  try {
    // Ensure we have a valid reading object
    if (!reading || reading.waterLevel === undefined) {
      console.error('Error: waterLevel value is required for minute-by-minute data');
      return false;
    }
    
    // Add timestamp if not present
    if (!reading.timestamp) {
      reading.timestamp = Date.now();
    }
    
    // Make sure the timestamp is a number
    if (typeof reading.timestamp === 'string') {
      reading.timestamp = parseInt(reading.timestamp, 10);
    }
    
    // Ensure we're storing values as numbers
    reading.waterLevel = parseFloat(reading.waterLevel);
    
    // Set status if not provided
    if (!reading.status) {
      reading.status = getStatusFromWaterLevel(reading.waterLevel);
    }
    
    console.log('Recording to minuteByMinuteData:', reading);
    
    // Create a timestamp-based key (YYYY-MM-DD-HH-MM)
    const date = new Date(reading.timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const timeKey = `${year}-${month}-${day}-${hour}-${minute}`;
    
    // Add the reading to minuteByMinuteData with timestamp-based key
    // This prevents duplicate entries for the same minute
    await set(ref(database, `minuteByMinuteData/${timeKey}`), {
      waterLevel: reading.waterLevel,
      timestamp: reading.timestamp,
      status: reading.status,
      deviceId: reading.deviceId || 'unknown'
    });
    
    return true;
  } catch (error) {
    console.error('Error recording minute by minute data:', error);
    return false;
  }
};

// Subscribe to minute by minute data
export const subscribeToMinuteByMinuteData = (callback) => {
  console.log('Setting up minuteByMinuteData subscription...');
  
  // Create a reference to the minuteByMinuteData node
  const minuteDataRef = ref(database, 'minuteByMinuteData');
  
  // Subscribe to the data
  const unsubscribe = onValue(minuteDataRef, (snapshot) => {
    console.log('Minute by minute data updated');
    
    if (snapshot.exists()) {
      try {
        const data = snapshot.val();
        
        // Convert the data object to an array
        const dataArray = Object.keys(data).map(key => {
          try {
            const entry = data[key];
            
            return {
              id: key,
              waterLevel: typeof entry.waterLevel === 'number' ? 
                entry.waterLevel : parseFloat(entry.waterLevel),
              timestamp: fixTimestamp(typeof entry.timestamp === 'number' ? 
                entry.timestamp : parseInt(entry.timestamp, 10)),
              deviceId: entry.deviceId || 'unknown',
              status: entry.status || getStatusFromWaterLevel(entry.waterLevel)
            };
          } catch (error) {
            console.error("Error processing minute data entry:", error, data[key]);
            return null;
          }
        }).filter(entry => entry !== null);
        
        // Filter out entries with invalid waterLevel
        const validEntries = dataArray.filter(reading => 
          reading.waterLevel !== undefined && !isNaN(reading.waterLevel)
        );
        
        console.log(`Found ${validEntries.length} valid readings in minuteByMinuteData`);
        
        if (validEntries.length > 0) {
          // Sort by timestamp (newest first)
          validEntries.sort((a, b) => b.timestamp - a.timestamp);
          
          // Notify the callback
          callback(validEntries);
        }
      } catch (error) {
        console.error("Error processing minute by minute data:", error);
      }
    } else {
      console.log('No data found in minuteByMinuteData');
      callback([]);
    }
  });
  
  // Return a function to unsubscribe
  return unsubscribe;
};

export default database;