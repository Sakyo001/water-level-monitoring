import React, { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
} from 'chart.js';
import { FaWater, FaBell, FaUser, FaCog, FaExclamationTriangle, FaPhone, FaList, FaArrowLeft } from 'react-icons/fa';
import { 
  subscribeToWaterLevelUpdates, 
  recordWaterLevelReading, 
  recordMinuteByMinuteData,
  subscribeToMinuteByMinuteData
} from './firebase';
import { format } from 'date-fns';
import './App.css';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

// Configure Leaflet marker
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Fix Leaflet default icon issue in React
// This is needed because Leaflet's assets are loaded differently in React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

// Custom hook for getting location
function useLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        setError('Unable to retrieve your location');
        console.error('Error getting location:', error);
        // Default to Caloocan City, Philippines if location access is denied
        setLocation({ lat: 14.6577, lng: 120.9842 });
      }
    );
  }, []);
  
  return { location, error };
}

// Leaflet Map Component with improved initialization - using React.memo to prevent unnecessary re-renders
const LeafletMap = React.memo(function LeafletMap({ onShowTrend }) {
  const mapInstance = useRef(null);
  const { location } = useLocation();
  const mapId = useRef(`map-${Math.random().toString(36).substr(2, 9)}`);
  const mapContainer = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  
  // Initialize map only when component is mounted and visible
  useEffect(() => {
    // Wait for the container to be ready in the DOM
    if (!mapContainer.current) return;
    
    // Clean up any existing map instance
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }
    
    // Only initialize map when location is available and container is visible
    if (location) {
      // Check if container has dimensions
      const container = mapContainer.current;
      const hasSize = container.offsetWidth > 0 && container.offsetHeight > 0;
      
      if (!hasSize) {
        console.warn('Map container has no size, delaying initialization');
        return;
      }
      
      // Create map with invalid invalidateSize handler
      try {
        console.log('Initializing map with location:', location);
        const map = L.map(mapId.current, {
          // Disable initial animations for stability
          fadeAnimation: false,
          zoomAnimation: false,
          // Properly handle scroll wheel zoom
          scrollWheelZoom: true,
          // Set zoom limits to prevent extreme zooming
          minZoom: 10,
          maxZoom: 18
        }).setView(
          [location.lat, location.lng], 
          15
        );
        
        // Add tile layer (OpenStreetMap)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);
        
        // Add zoom control in a better position
        L.control.zoom({
          position: 'topright'
        }).addTo(map);
        
        // Add marker for current location
        const marker = L.marker([location.lat, location.lng]).addTo(map);
        
        // Add popup with button to show water level trend
        const popupContent = document.createElement('div');
        popupContent.innerHTML = `
          <div style="text-align: center;">
            <h3 style="margin: 5px 0;">Your Location</h3>
            <p style="margin: 5px 0;">Lat: ${location.lat.toFixed(4)}, Lng: ${location.lng.toFixed(4)}</p>
          </div>
        `;
        
        const button = document.createElement('button');
        button.innerHTML = 'Show Water Level Trend';
        button.className = 'popup-button';
        button.onclick = onShowTrend;
        button.style.cssText = 'background: #2563eb; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 10px; width: 100%;';
        
        popupContent.appendChild(button);
        marker.bindPopup(popupContent);
        
        // Store map instance in ref
        mapInstance.current = map;
        
        // Prevent browser zoom when using Ctrl+scroll on the map
        container.addEventListener('wheel', (e) => {
          if (e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
          }
        }, { passive: false });
        
        // Force a resize after a short delay to ensure the map renders correctly
        setTimeout(() => {
          if (mapInstance.current) {
            mapInstance.current.invalidateSize(true);
            setMapReady(true);
          }
        }, 300);
      } catch (error) {
        console.error('Error initializing map:', error);
      }
    }
    
    // Cleanup function to properly remove the map
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      
      // Remove any wheel event listeners to prevent memory leaks
      if (mapContainer.current) {
        mapContainer.current.removeEventListener('wheel', () => {});
      }
    };
  }, [location, onShowTrend]);
  
  // Add global wheel event prevention
  useEffect(() => {
    // Function to prevent CTRL + wheel zoom outside the map
    const preventZoom = (e) => {
      // Allow zooming only if inside the map container
      if (mapContainer.current && !mapContainer.current.contains(e.target) && e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
      return true;
    };
    
    // Add event listeners
    document.addEventListener('wheel', preventZoom, { passive: false });
    
    // Cleanup
    return () => {
      document.removeEventListener('wheel', preventZoom);
    };
  }, []);
  
  // Handle container size changes and window resizing
  useEffect(() => {
    if (!mapInstance.current || !mapReady) return;
    
    // Function to update map when container size changes
    const handleResize = () => {
      if (mapInstance.current) {
        setTimeout(() => {
          try {
            mapInstance.current.invalidateSize(true);
          } catch (error) {
            console.error('Error in map resize:', error);
          }
        }, 50);
      }
    };
    
    // Listen for window resize events
    window.addEventListener('resize', handleResize);
    
    // Initial resize 
    handleResize();
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [mapReady]);
  
  // Use a random ID for each map to avoid container initialization conflicts
  return (
    <div 
      id={mapId.current}
      ref={mapContainer}
      style={{ 
        width: '100%', 
        height: '100%', 
        minHeight: '400px',
        touchAction: 'pan-x pan-y' // Prevent touch gestures from zooming the page
      }}
    >
      {!location && <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>Loading map...</div>}
    </div>
  );
}, (prevProps, nextProps) => true); // Always return true to prevent re-renders when parent component updates

// Helper functions
const getStatusFromDistance = (distance) => {
  if (distance === null || distance === undefined) return "unknown";
  // 0-3cm: Safe
  if (distance <= 3) return "normal";
  // 3.1-6cm: Warning
  if (distance <= 6) return "warning";
  // 6.1cm+: Danger
  return "danger";
};

// New helper function to determine status from water level percentage
const getStatusFromWaterLevel = (waterLevel) => {
  if (waterLevel === null || waterLevel === undefined) return "unknown";
  
  // Convert waterLevel percentage to distance
  // Assuming MAX_DISPLAY_DISTANCE is 8cm
  const distance = (waterLevel / 100) * 8;
  
  return getStatusFromDistance(distance);
};

const getStatusText = (status) => {
  switch (status) {
    case "normal":
      return "Safe";
    case "warning":
      return "Warning";
    case "danger":
      return "Critical";
    default:
      return "Unknown";
  }
};

// Recommendations data from recommendation.txt file
const recommendationsData = {
  normal: {
    safety: [
      [
        { title: "Stay Informed", content: "Monitor updates from PAGASA, local barangay alerts, or trusted news sources on TV, radio, or online." },
        { title: "Prepare a Go-Bag (Emergency Kit)", content: "Include essentials such as water, food, flashlight, extra clothes, whistle, medicines, power bank, and important documents in a waterproof bag." },
        { title: "Identify Nearest Evacuation Centers", content: "Familiarize yourself with the nearest evacuation centers and safe paths within your area." }
      ],
      [
        { title: "Check Local Infrastructure", content: "Visit flood-prone areas and assess bridges, roads, and drains near your home to ensure they are clear and safe." },
        { title: "Build a Family Safety Network", content: "Set up a small group with neighbors or close friends to check on each other's safety regularly during storm season." },
        { title: "Review Insurance Policies", content: "Make sure your home, belongings, and health are covered by insurance in case of flood-related damages." }
      ]
    ],
    causes: [
      { title: "Continuous Rainfall in Nearby Areas", content: "Even if the community itself is not experiencing heavy rain, water from upstream areas or mountains may flow downstream, gradually increasing water levels without immediately triggering an alert." },
      { title: "Tidal Influence or High Tide", content: "In coastal or low-lying areas near bodies of water, rising tides can contribute to higher water levels, especially when combined with river inflow, even if there is no immediate threat of flooding." },
      { title: "Inspect Drainage and Evacuation Routes", content: "Blocked or silted rivers, canals, or drainage systems can cause water levels to rise more than usual, slowing down natural water flow and creating localized flooding risks without necessarily reaching an official alert level." }
    ]
  },
  warning: {
    safety: [
      [
        { title: "Coordinate with Authorities", content: "Inform them if you need help with evacuation; they often have rescue teams or transport options for residents without vehicles." },
        { title: "Secure Your Home and Belongings", content: "Move valuables and electrical items to higher places and switch off appliances if flooding is expected." },
        { title: "Pack Light and Be Ready to EVACUATE", content: "Wear non-slip footwear, bring your go-bag, and be ready to leave on foot or via community rescue boats/vehicles." }
      ],
      [
        { title: "Test Emergency Systems", content: "If your home has a backup power generator, ensure it's working, and check that emergency lighting is functional." },
        { title: "Prepare for Water Shortages", content: "Store additional water for drinking, cooking, and sanitation in case local water systems are disrupted." },
        { title: "Secure Outdoor Items", content: "Bring in any outdoor furniture, tools, or decor that could be swept away by heavy winds or flooding." }
      ]
    ],
    causes: [
      { title: "Continuous Rainfall in Nearby Areas", content: "Even if the community itself is not experiencing heavy rain, water from upstream areas or mountains may flow downstream, gradually increasing water levels without immediately triggering an alert." },
      { title: "Tidal Influence or High Tide", content: "In coastal or low-lying areas near bodies of water, rising tides can contribute to higher water levels, especially when combined with river inflow, even if there is no immediate threat of flooding." },
      { title: "Inspect Drainage and Evacuation Routes", content: "Blocked or silted rivers, canals, or drainage systems can cause water levels to rise more than usual, slowing down natural water flow and creating localized flooding risks without necessarily reaching an official alert level." }
    ]
  },
  danger: {
    safety: [
      [
        { title: "Comply with Evacuation Orders Immediately", content: "Adhere promptly to directives from local authorities and emergency personnel to ensure personal safety and avoid life-threatening situations." },
        { title: "Avoid Floodwaters", content: "Refrain from walking through or wading in floodwaters, as they may be deeper, faster-moving, or contaminated. Use designated safe routes and elevated areas when evacuating." },
        { title: "Assist Vulnerable Individuals", content: "Extend help to children, the elderly, and persons with disabilities. Maintain communication and remain calm to ensure an orderly and safe evacuation process." }
      ],
      [
        { title: "Create an Escape Route", content: "Before evacuating, quickly map out a route that avoids flood-prone streets and areas with heavy traffic." },
        { title: "Comply with Mandatory Evacuation Orders", content: "If authorities initiate a forced evacuation, follow instructions without hesitation. Take only essential items, assist those in need, and evacuate in an orderly and timely manner to ensure safety." },
        { title: "Prioritize Health and First Aid", content: "Have a first aid kit ready, especially for waterborne illnesses. If exposed to contaminated water, wash hands frequently with clean water." }
      ]
    ],
    causes: [
      { title: "Continuous Rainfall in Nearby Areas", content: "Even if the community itself is not experiencing heavy rain, water from upstream areas or mountains may flow downstream, gradually increasing water levels without immediately triggering an alert." },
      { title: "Tidal Influence or High Tide", content: "In coastal or low-lying areas near bodies of water, rising tides can contribute to higher water levels, especially when combined with river inflow, even if there is no immediate threat of flooding." },
      { title: "Inspect Drainage and Evacuation Routes", content: "Blocked or silted rivers, canals, or drainage systems can cause water levels to rise more than usual, slowing down natural water flow and creating localized flooding risks without necessarily reaching an official alert level." }
    ]
  },
  unknown: {
    safety: [
      [
        { title: "Stay Vigilant", content: "Monitor the system for updates on water levels." },
        { title: "Check Connections", content: "Ensure the monitoring system is properly connected." }
      ]
    ],
    causes: [
      { title: "System Status Unknown", content: "The monitoring system may be offline or experiencing connectivity issues." }
    ]
  }
};

// Get randomized safety recommendations based on current status
const getRandomSafetyRecommendations = (status) => {
  const statusData = recommendationsData[status] || recommendationsData.unknown;
  
  // Randomly select one of the safety recommendation sets
  const randomSetIndex = Math.floor(Math.random() * statusData.safety.length);
  return statusData.safety[randomSetIndex];
};

// Get randomized potential causes based on current status
const getRandomPotentialCauses = (status) => {
  const statusData = recommendationsData[status] || recommendationsData.unknown;
  
  // Shuffle the causes array and return the first 2 items
  return [...statusData.causes].sort(() => 0.5 - Math.random()).slice(0, 2);
};

// Emergency hotlines
const emergencyHotlines = [
  { name: "NDRRMC", number: "(02) 8911-1406" },
  { name: "Red Cross", number: "143 or (02) 8527-8385" },
  { name: "Philippine Coast Guard", number: "(02) 8527-8481" },
  { name: "Bureau of Fire Protection", number: "911 or (02) 8426-0219" },
  { name: "PNP Emergency Hotline", number: "911 or 117" }
];

// Context for chart visibility
const ChartVisibilityContext = React.createContext({
  showModal: false,
  setShowModal: () => {}
});

// Water Level Trend Modal Component
function WaterLevelTrendModal({ show, onClose, data, options, currentWaterLevel, alertStatus, timestamp }) {
  if (!show) return null;
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Water Level Trend</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="tabular-view-link">
          <a href="#" onClick={(e) => {
            e.preventDefault();
            onClose();
            // Show historical view
            window.showHistoricalView();
          }}>
            Tabular View →
          </a>
        </div>
        <div className="values-header">
          Values <span className="live-indicator">● Live</span>
        </div>
        <div className="modal-body">
          <div className="chart-container">
            {data.labels.length > 0 ? (
              <Line data={data} options={options} />
            ) : (
              <div className="no-readings">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="48" height="48">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p>No readings available yet. Waiting for sensor data.</p>
              </div>
            )}
          </div>
        </div>
        {timestamp && (
          <div className="modal-footer">
            <div>
              <div className="chart-date">{format(new Date(), 'MMMM d, yyyy')}</div>
              <div className="chart-time">{format(new Date(), 'HH:mm')} </div>
            </div>
            <div className="chart-value">
              <div className={`dot status-${alertStatus}`}></div>
              {currentWaterLevel !== null ? `${Math.min(((currentWaterLevel / 100) * 8).toFixed(1), 8)}cm` : 'No data'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Generate hours for table header (from 23:00 to 24:00)
const generateHoursHeader = () => {
  const hours = [];
  for (let i = 23; i >= 0; i--) {
    hours.push(`${i.toString().padStart(2, '0')}:00`);
  }
  hours.push('24:00');
  return hours;
};

// Format function to help organize readings by hour
const getHourFromTimestamp = (timestamp) => {
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, '0')}:00`;
};

// Format function for date to display in table
const formatDateForTable = (dateString) => {
  const date = new Date(dateString);
  return format(date, 'MMMM dd, yyyy');
};

// Function to show timestamp in browser console for debugging
function logTimestamp(label, timestamp) {
  const date = new Date(timestamp);
  console.log(`${label}: ${date.toLocaleString()} (${timestamp})`);
}

function App() {
  // State management
  const [waterLevelHistory, setWaterLevelHistory] = useState([]);
  const [minuteByMinuteHistory, setMinuteByMinuteHistory] = useState([]);
  const [currentWaterLevel, setCurrentWaterLevel] = useState(null);
  const [alertStatus, setAlertStatus] = useState('unknown');
  const [showHistorical, setShowHistorical] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // State for randomized recommendations and causes
  const [safetyRecommendations, setSafetyRecommendations] = useState([]);
  const [potentialCauses, setPotentialCauses] = useState([]);

  // Make setShowHistorical available globally for the modal
  window.showHistoricalView = () => setShowHistorical(true);

  // Subscribe to water level updates from Firebase with smooth updates and increased debounce
  useEffect(() => {
    // Create smooth state updater with stronger debouncing
    const updateDataSmoothly = (data) => {
      if (!data || data.length === 0) return;
      
      // Only update if we're not currently showing the modal or historical view
      // This prevents unnecessary re-renders while viewing the chart
      if (showModal || showHistorical) {
        // Just update currentWaterLevel for the chart, but don't trigger full re-render
        const sortedData = [...data].sort((a, b) => b.timestamp - a.timestamp);
        const latestReading = sortedData[0];
        if (latestReading) {
          setCurrentWaterLevel(prevLevel => {
            if (prevLevel !== latestReading.waterLevel) {
              return latestReading.waterLevel;
            }
            return prevLevel;
          });
        }
        return;
      }
      
      // Sort data by timestamp in descending order (newest first)
      const sortedData = [...data].sort((a, b) => b.timestamp - a.timestamp);
      
      // Update history without triggering re-renders for each small change
      setWaterLevelHistory(prevHistory => {
        // Only update if there are actual significant changes (more than just the timestamp)
        const prevFirstItem = prevHistory[0] || {};
        const newFirstItem = sortedData[0] || {};
        
        if (prevFirstItem.waterLevel !== newFirstItem.waterLevel || 
            Math.abs((prevFirstItem.timestamp || 0) - (newFirstItem.timestamp || 0)) > 60000) {
          return sortedData;
        }
        return prevHistory;
      });
      
      // Update current water level from the most recent reading
      const latestReading = sortedData[0];
      if (latestReading) {
        // Only update if the water level actually changed
        setCurrentWaterLevel(prevLevel => {
          if (prevLevel !== latestReading.waterLevel) {
            return latestReading.waterLevel;
          }
          return prevLevel;
        });
        
        // Calculate new status - only update if status changed
        const newStatus = getStatusFromWaterLevel(latestReading.waterLevel);
        setAlertStatus(prevStatus => {
          if (prevStatus !== newStatus) {
            // Update recommendations and causes when status changes
            setSafetyRecommendations(getRandomSafetyRecommendations(newStatus));
            setPotentialCauses(getRandomPotentialCauses(newStatus));
            return newStatus;
          }
          return prevStatus;
        });
      }
      
      // Only set loading to false once
      setLoading(prevLoading => {
        if (prevLoading) return false;
        return prevLoading;
      });
    };

    // Subscribe to regular water level updates
    const unsubscribe = subscribeToWaterLevelUpdates(updateDataSmoothly);
    
    // Subscribe to minute-by-minute data specifically for the graph
    const unsubscribeMinuteData = subscribeToMinuteByMinuteData((data) => {
      console.log(`Received ${data.length} minute-by-minute data points`);
      
      // Only update if we're showing the modal or there's a significant change
      if (showModal || minuteByMinuteHistory.length === 0 || 
          (data.length > 0 && minuteByMinuteHistory.length > 0 && 
           data[0].timestamp !== minuteByMinuteHistory[0].timestamp)) {
        setMinuteByMinuteHistory(data);
      }
    });
    
    return () => {
      unsubscribe();
      unsubscribeMinuteData();
    };
  }, [showModal, showHistorical]);

  // Set up a timer to record historical data points every 5 minutes
  useEffect(() => {
    // Only run if we have current water level data
    if (currentWaterLevel === null) return;

    // Function to record a 5-minute interval data point
    const recordHistoricalDataPoint = async () => {
      try {
        // Check if we already have a reading within the last 5 minutes
        const now = new Date();
        logTimestamp("Recording at", now.getTime());
        
        // Record the current water level to the minute-by-minute table
        const result = await recordMinuteByMinuteData({
          waterLevel: currentWaterLevel,
          timestamp: now.getTime(),
          deviceId: 'webapp-5minute-recorder',
          isHistoricalPoint: true
        });
        
        if (result) {
          console.log("Successfully recorded 5-minute interval data point");
        }
      } catch (error) {
        console.error("Error recording 5-minute interval data point:", error);
      }
    };

    // Record a point immediately
    recordHistoricalDataPoint();
    
    // Set up an interval to record data points every 5 minutes
    const intervalId = setInterval(recordHistoricalDataPoint, 5 * 60 * 1000);
    
    // Clean up the interval when component unmounts
    return () => clearInterval(intervalId);
  }, [currentWaterLevel]);
  
  // Debug: log the number of minute-by-minute data points when it changes
  useEffect(() => {
    console.log(`minuteByMinuteHistory updated with ${minuteByMinuteHistory.length} points`);
    if (minuteByMinuteHistory.length > 0) {
      logTimestamp("Newest point", minuteByMinuteHistory[0].timestamp);
      logTimestamp("Oldest point", minuteByMinuteHistory[minuteByMinuteHistory.length-1].timestamp);
    }
  }, [minuteByMinuteHistory]);

  // Function to create mock data for testing if no real data exists
  const createMockDataIfNeeded = (readings) => {
    // If we have real data, return it
    if (readings && readings.length > 0) {
      return readings;
    }
    
    // Create mock data for testing
    const mockData = [];
    const now = new Date();
    
    // Generate data points for the last 6 hours, every 5 minutes
    for (let i = 0; i < 72; i++) {
      const timestamp = new Date(now);
      timestamp.setMinutes(timestamp.getMinutes() - (i * 5));
      
      // Generate a random water level between 30-70%
      const waterLevel = Math.floor(Math.random() * 40) + 30;
      
      mockData.push({
        timestamp: timestamp.getTime(),
        waterLevel: waterLevel,
        id: `mock-${i}`
      });
    }
    
    return mockData;
  };
  
  // Use minute-by-minute data when available, fall back to waterLevelHistory
  const effectiveWaterLevelHistory = minuteByMinuteHistory.length > 0 
    ? minuteByMinuteHistory 
    : (waterLevelHistory.length > 0 
        ? waterLevelHistory 
        : createMockDataIfNeeded([]));
  
  // Filter readings to get one every 5 minutes for the historical view
  const filterFiveMinuteReadings = (readings) => {
    if (!readings || readings.length === 0) return [];
    
    const filteredReadings = [];
    const timeGroups = {};
    
    // Group readings by date and 5-minute blocks
    readings.forEach(reading => {
      const date = format(new Date(reading.timestamp), 'yyyy-MM-dd');
      const hour = new Date(reading.timestamp).getHours();
      const minute = new Date(reading.timestamp).getMinutes();
      const fiveMinBlock = Math.floor(minute / 5) * 5;
      const key = `${date}-${hour}-${fiveMinBlock}`;
      
      // If we don't have a reading for this 5-minute block yet, or this one is newer
      if (!timeGroups[key] || reading.timestamp > timeGroups[key].timestamp) {
        timeGroups[key] = reading;
      }
    });
    
    // Convert the grouped readings back to an array
    return Object.values(timeGroups).sort((a, b) => b.timestamp - a.timestamp);
  };
  
  // Apply the filter before passing to formatHistoricalDataForTable
  const fiveMinFilteredReadings = filterFiveMinuteReadings(effectiveWaterLevelHistory);
  
  // Function to create timestamps for the last 6 hours at 5-minute intervals
  const generateTimeLabels = () => {
    const labels = [];
    const now = new Date();
    
    // Start from 6 hours ago (good timeframe for 5-minute data)
    const startTime = new Date(now);
    startTime.setHours(now.getHours() - 6);
    
    // Round to nearest 5 minutes
    startTime.setMinutes(Math.floor(startTime.getMinutes() / 5) * 5);
    startTime.setSeconds(0);
    startTime.setMilliseconds(0);
    
    // Generate 72 labels (6 hours * 12 intervals per hour)
    for (let i = 0; i < 72; i++) {
      const timeLabel = new Date(startTime);
      timeLabel.setMinutes(timeLabel.getMinutes() + (i * 5));
      labels.push({
        time: timeLabel,
        formatted: format(timeLabel, 'HH:mm'),
        timestamp: timeLabel.getTime()
      });
    }
    
    return labels;
  };
  
  // Generate time labels for X-axis
  const timeLabels = generateTimeLabels();
  
  // Create a simplified dataset directly from minuteByMinuteHistory
  const createChartDataPoints = () => {
    // Get the data points from minuteByMinuteHistory
    // If no minute-by-minute data, fall back to regular history
    const dataPoints = [];
    
    console.log(`Creating chart data points from ${minuteByMinuteHistory.length} readings`);
    
    // First, create a lookup map of timestamps
    const readingsMap = {};
    minuteByMinuteHistory.forEach(reading => {
      // Convert to 5-minute precision for matching
      const date = new Date(reading.timestamp);
      date.setMinutes(Math.floor(date.getMinutes() / 5) * 5);
      date.setSeconds(0);
      date.setMilliseconds(0);
      readingsMap[date.getTime()] = reading;
    });
    
    // Add the current reading for real-time tracking
    if (currentWaterLevel !== null) {
      // Create a data point for the current time
      const now = new Date();
      // Round to the nearest minute for better display
      now.setSeconds(0);
      now.setMilliseconds(0);
      
      // Add the current reading to our map
      readingsMap[now.getTime()] = {
        waterLevel: currentWaterLevel,
        timestamp: now.getTime(),
        id: 'current-realtime'
      };
    }
    
    // Map the time labels to data points
    timeLabels.forEach((label, index) => {
      // Look for a reading at this exact timestamp
      let reading = readingsMap[label.timestamp];
      
      // If no exact match, find the closest reading in real-time (forward looking)
      if (!reading && currentWaterLevel !== null) {
        // Get timestamp for now
        const now = new Date();
        
        // If this label is for a time between the last 5-minute record and now,
        // interpolate the value
        if (label.timestamp > timeLabels[0].timestamp && label.time <= now) {
          // Find the most recent 5-minute reading before this point
          const mostRecentReadingTime = Math.max(
            ...Object.keys(readingsMap)
              .map(Number)
              .filter(time => time < label.timestamp)
          );
          
          if (!isNaN(mostRecentReadingTime) && mostRecentReadingTime > 0) {
            const mostRecentReading = readingsMap[mostRecentReadingTime];
            
            // Use a simple interpolation for values between most recent reading and current reading
            const timeDiff = now.getTime() - mostRecentReadingTime;
            const timePosition = label.timestamp - mostRecentReadingTime;
            const ratio = timeDiff > 0 ? timePosition / timeDiff : 0;
            
            // Interpolate between most recent reading and current water level
            const interpolatedWaterLevel = mostRecentReading.waterLevel + 
              (currentWaterLevel - mostRecentReading.waterLevel) * ratio;
            
            reading = {
              waterLevel: interpolatedWaterLevel,
              timestamp: label.timestamp,
              id: 'interpolated'
            };
          }
        }
      }
      
      if (reading) {
        // Real data exists for this timestamp
        dataPoints.push(Math.min(((reading.waterLevel / 100) * 8).toFixed(1), 8));
      } 
      // If we're testing and have no real data, generate sample data
      else if (minuteByMinuteHistory.length === 0 && effectiveWaterLevelHistory.length === 0) {
        // Create a sine wave pattern
        const sineValue = Math.sin(index * 0.1) * 3 + 4; // Values between 1-7
        dataPoints.push(sineValue.toFixed(1));
      } 
      // We have some data but not for this specific timestamp
      else {
        dataPoints.push(null);
      }
    });
    
    return dataPoints;
  };
  
  // Update chart when current water level changes
  const [lastChartUpdate, setLastChartUpdate] = useState(Date.now());
  
  // Force chart to update with current water level every second
  useEffect(() => {
    // Only run if modal is visible
    if (!showModal) return;
    
    const intervalId = setInterval(() => {
      // Schedule an update to refresh the chart with latest water level
      setLastChartUpdate(Date.now());
    }, 1000); // Update every second for smooth real-time tracking
    
    return () => clearInterval(intervalId);
  }, [showModal]);
  
  // Regenerate chart data whenever the water level changes or we're updating
  const dynamicChartData = React.useMemo(() => {
    // Only regenerate if we have a current water level
    if (currentWaterLevel === null) {
      return {
        labels: timeLabels.map(label => label.formatted),
        datasets: [
          {
            label: 'Waterlevel',
            data: createChartDataPoints(),
            fill: false,
            backgroundColor: 'rgba(37, 99, 235, 0.2)',
            borderColor: '#2563eb',
            borderWidth: 3,
            pointBackgroundColor: (context) => {
              // Use a different color for the current real-time point
              const index = context.dataIndex;
              const label = timeLabels[index];
              
              // If this is around the current time, use a different color
              const now = new Date();
              now.setSeconds(0);
              now.setMilliseconds(0);
              
              const isCurrentTime = Math.abs(label.time - now) < 5 * 60 * 1000; // Within 5 minutes
              
              return isCurrentTime ? '#ef4444' : '#2563eb';
            },
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 8,
            tension: 0.2,
            spanGaps: true, // Connect the line across gaps (null values)
          },
        ],
      };
    }
    
    return {
      labels: timeLabels.map(label => label.formatted),
      datasets: [
        {
          label: 'Waterlevel',
          data: createChartDataPoints(),
          fill: false,
          backgroundColor: 'rgba(37, 99, 235, 0.2)',
          borderColor: '#2563eb',
          borderWidth: 3,
          pointBackgroundColor: (context) => {
            // Use a different color for the current real-time point
            const index = context.dataIndex;
            const label = timeLabels[index];
            
            // If this is around the current time, use a different color
            const now = new Date();
            now.setSeconds(0);
            now.setMilliseconds(0);
            
            const isCurrentTime = Math.abs(label.time - now) < 5 * 60 * 1000; // Within 5 minutes
            
            return isCurrentTime ? '#ef4444' : '#2563eb';
          },
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 8,
          tension: 0.2,
          spanGaps: true, // Connect the line across gaps (null values)
        },
      ],
    };
  }, [currentWaterLevel, minuteByMinuteHistory, lastChartUpdate, showModal]);
  
  // Format historical data for table display by date and hour
  const formatHistoricalDataForTable = () => {
    // Group readings by date first
    const dateGroups = {};
    
    fiveMinFilteredReadings.forEach(reading => {
      const date = format(new Date(reading.timestamp), 'yyyy-MM-dd');
      const hour = getHourFromTimestamp(reading.timestamp);
      
      if (!dateGroups[date]) {
        dateGroups[date] = {};
      }
      
      // Add reading at this hour if not exists or if it's newer than existing
      if (!dateGroups[date][hour] || reading.timestamp > dateGroups[date][hour].timestamp) {
        dateGroups[date][hour] = reading;
      }
    });
    
    // Sort dates in descending order (newest first)
    return Object.keys(dateGroups)
      .sort((a, b) => new Date(b) - new Date(a))
      .map(date => ({
        date,
        formattedDate: formatDateForTable(date),
        readings: dateGroups[date]
      }));
  };

  // Determine trend direction (up, down, or none)
  const getTrendDirection = (currentReading, previousHourReading) => {
    if (!previousHourReading) return null;
    
    return currentReading.waterLevel > previousHourReading.waterLevel 
      ? 'up' 
      : currentReading.waterLevel < previousHourReading.waterLevel 
        ? 'down' 
        : null;
  };

  // Chart options configuration
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 0 // Disable animations for immediate rendering
    },
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#1e293b',
        bodyColor: '#1e293b',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: 12,
        boxPadding: 6,
        usePointStyle: true,
        callbacks: {
          title: (context) => {
            if (!context.length) return '';
            const label = timeLabels[context[0].dataIndex];
            if (label) {
              return format(label.time, 'MMMM d, yyyy');
            }
            return '';
          },
          label: (context) => {
            const label = timeLabels[context.dataIndex];
            if (!label) return '';
            
            const dataValue = context.raw;
            if (dataValue === null) return 'No data available';
            
            return [
              `Time: ${format(label.time, 'HH:mm')}`,
              `Waterlevel: ${dataValue}cm`
            ];
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 10, // Changed from 8cm to 10cm for the Y-axis scale, but data is still capped at 8cm
        title: {
          display: true,
          text: 'Values (cm)'
        },
        ticks: {
          callback: function(value) {
            return value + ' cm';
          }
        },
        grid: {
          color: 'rgba(226, 232, 240, 0.5)',
        }
      },
      x: {
        title: {
          display: true,
          text: 'Time (5-minute intervals)'
        },
        grid: {
          display: true,
          color: 'rgba(226, 232, 240, 0.3)',
          tickBorderDash: [5, 5]
        },
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          callback: function(index) {
            // Show every 3rd label (every 15 minutes)
            return index % 3 === 0 ? timeLabels[index].formatted : '';
          }
        }
      }
    },
    elements: {
      line: {
        tension: 0.4, // Increased for smoother line
        borderWidth: 3 // Thicker line for better visibility
      },
      point: {
        radius: function(context) {
          // Make points visible when data exists
          const value = context.raw;
          return value === null ? 0 : 4;
        },
        hoverRadius: 8,
        borderWidth: 2
      }
    }
  };
  
  // Add CSS for the live indicator
  useEffect(() => {
    // Add the CSS for the live indicator
    const style = document.createElement('style');
    style.textContent = `
      .live-indicator {
        color: #ef4444;
        font-size: 0.75rem;
        animation: pulse 2s infinite;
        margin-left: 0.5rem;
      }
      
      @keyframes pulse {
        0% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
        100% {
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
    
    // Cleanup
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  /* Add this style block to fix UI overflow issues */
  useEffect(() => {
    // Add CSS to fix overflow issues 
    const style = document.createElement('style');
    style.textContent = `
      body, html {
        margin: 0;
        padding: 0;
        height: 100%;
        width: 100%;
        overflow-x: hidden;
      }
      
      .app {
        display: flex;
        flex-direction: column;
        height: 100vh;
        max-height: 100vh;
        overflow: hidden;
      }
      
      .main-layout {
        height: calc(100vh - 60px);
        overflow: hidden;
      }
      
      .sidebar {
        height: 100%;
        overflow-y: auto;
        overflow-x: hidden;
        max-height: calc(100vh - 60px);
      }
      
      .map-container {
        height: 100%;
        overflow: hidden;
      }
      
      .main-content {
        overflow: hidden;
        height: 100%;
      }
      
      @media (max-width: 768px) {
        .main-layout {
          flex-direction: column;
          overflow: hidden;
        }
        
        .sidebar {
          max-height: 40vh;
        }
        
        .main-content {
          height: 60vh;
        }
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <ChartVisibilityContext.Provider value={{ showModal, setShowModal }}>
    <div className="app">
        {/* Header */}
      <header className="header">
        <div className="logo">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
            <span>Aqua Gauge: Water Level Monitoring System</span>
        </div>
        <div className="header-icons">
            {!showHistorical && (
              <button 
                className="historical-data-btn"
                onClick={() => setShowHistorical(true)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Historical Data Tabular View
              </button>
            )}
        </div>
      </header>

        {/* Main Content */}
        {showHistorical ? (
          /* Historical data view - Full width */
          <div className="chart-view full-width">
            <div className="historical-header">
              <button 
                className="back-button"
                onClick={() => setShowHistorical(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="24" height="24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
              <div className="historical-title">Historical Data Tabular View</div>
      </div>

            <div className="historical-data-header">
              Water Level Historical Data
            </div>
            
            <div className="historical-table-container">
              {waterLevelHistory.length > 0 ? (
                <table className="historical-table">
                <thead>
                  <tr>
                    <th>Date</th>
                      {generateHoursHeader().map(hour => (
                        <th key={hour}>{hour}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                    {formatHistoricalDataForTable().map(dayData => {
                      const hours = generateHoursHeader();
                      return (
                        <tr key={dayData.date}>
                          <td className="date-cell">{dayData.formattedDate}</td>
                          {hours.map(hour => {
                            const reading = dayData.readings[hour];
                            if (!reading) return <td key={hour}></td>;
                            
                            const status = getStatusFromWaterLevel(reading.waterLevel);
                            
                            // Get previous hour for trend
                            const hourIndex = hours.indexOf(hour);
                            const prevHour = hourIndex < hours.length - 1 ? hours[hourIndex + 1] : null;
                            const prevReading = prevHour ? dayData.readings[prevHour] : null;
                            const trend = getTrendDirection(reading, prevReading);
                            
                            return (
                              <td key={hour}>
                                <div className={`reading-value ${status}`}>
                                  {trend === 'up' && <div className="arrow arrow-up"></div>}
                                  {trend === 'down' && <div className="arrow arrow-down"></div>}
                                  {((reading.waterLevel / 100) * 8).toFixed(1)}cm
                                </div>
                              </td>
                            );
                          })}
                    </tr>
                      );
                    })}
                </tbody>
              </table>
              ) : (
                <div className="no-readings">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" width="48" height="48">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>No historical data available yet. Waiting for sensor data.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="main-layout">
            {/* Sidebar */}
              <div className="sidebar">
              {/* Status boxes */}
              <div className="sidebar-section">
                <div className={`status-box ${alertStatus}`}>
                  <div className="status-title">Current Level Status (in cm)</div>
                  <div className="status-value">
                    {currentWaterLevel !== null ? `${Math.min(((currentWaterLevel / 100) * 8).toFixed(1), 8)}cm` : 'Unknown'}
                  </div>
                </div>

                <div className={`status-box ${alertStatus}`}>
                  <div className="status-title">Alert Status</div>
                  <div className="status-value">
                    {alertStatus === 'normal' && 'Safe'}
                    {alertStatus === 'warning' && 'Warning'}
                    {alertStatus === 'danger' && 'Critical'}
                    {alertStatus === 'unknown' && 'No data available'}
                  </div>
                </div>
              </div>

              {/* Safety Recommendations */}
              <div className="status-box">
                <h3>Safety Recommendations</h3>
                {safetyRecommendations.map((rec, index) => (
                  <div className="recommendation-item" key={index}>
                    <h4>{rec.title}</h4>
                    <p>{rec.content}</p>
                  </div>
                ))}
                </div>

              {/* Potential Causes */}
              <div className="sidebar-section">
                <h3>Potential Causes</h3>
                {potentialCauses.map((cause, index) => (
                  <div className="recommendation-item" key={index}>
                    <h4>{cause.title}</h4>
                    <p>{cause.content}</p>
                  </div>
                ))}
      </div>

              {/* Emergency hotlines */}
              <div className="sidebar-section">
                <h3>Emergency Hotlines</h3>
                {emergencyHotlines.map((hotline, index) => (
                  <div className="hotline-item" key={index}>
                    <h4>{hotline.name}</h4>
                    <p>{hotline.number}</p>
              </div>
                ))}
              </div>
            </div>

            {/* Main content area */}
            <div className="main-content">
              {/* Map view */}
              <div className="map-container">
                <LeafletMap onShowTrend={() => setShowModal(true)} />
              </div>

              {/* Water Level Trend Modal */}
              <WaterLevelTrendModal 
                show={showModal}
                onClose={() => setShowModal(false)}
                data={dynamicChartData}
                options={chartOptions}
                currentWaterLevel={currentWaterLevel}
                alertStatus={alertStatus}
                timestamp={waterLevelHistory[0]?.timestamp}
              />
            </div>
          </div>
        )}
    </div>
    </ChartVisibilityContext.Provider>
  );
}

export default App;

