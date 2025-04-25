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
import { subscribeToWaterLevelUpdates, recordWaterLevelReading } from './firebase';
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

// Leaflet Map Component with improved initialization
function LeafletMap({ onShowTrend }) {
  const mapInstance = useRef(null);
  const { location } = useLocation();
  const mapId = useRef(`map-${Math.random().toString(36).substr(2, 9)}`);
  
  useEffect(() => {
    // Only initialize map when location is available
    if (location && !mapInstance.current) {
      // Create map instance
      const map = L.map(mapId.current).setView(
        [location.lat, location.lng], 
        15
      );
      
      // Add tile layer (OpenStreetMap)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
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
    }
    
    // Cleanup function to properly remove the map
    return () => {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    };
  }, [location, onShowTrend]);
  
  // Use a random ID for each map to avoid container initialization conflicts
  return (
    <div 
      id={mapId.current}
      style={{ width: '100%', height: '100%', minHeight: '400px' }}
    >
      {!location && <div style={{display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%'}}>Loading map...</div>}
    </div>
  );
}

// Helper functions
const getStatusFromDistance = (distance) => {
  if (distance === null || distance === undefined) return "unknown";
  if (distance > 100) return "normal";
  if (distance > 70) return "warning";
  return "danger";
};

// New helper function to determine status from water level percentage
const getStatusFromWaterLevel = (waterLevel) => {
  if (waterLevel === null || waterLevel === undefined) return "unknown";
  if (waterLevel < 30) return "normal";
  if (waterLevel < 80) return "warning";
  return "danger";
};

const getStatusText = (status) => {
  switch (status) {
    case "normal":
      return "Normal";
    case "warning":
      return "Warning";
    case "danger":
      return "Danger";
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
        <div className="values-header">Values</div>
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
              <div className="chart-date">{format(new Date(timestamp), 'MMMM d, yyyy')}</div>
              <div className="chart-time">{format(new Date(timestamp), 'HH:mm')} </div>
            </div>
            <div className="chart-value">
              <div className={`dot status-${alertStatus}`}></div>
              {currentWaterLevel !== null ? `${(currentWaterLevel / 10 * 100).toFixed(1)}cm` : 'No data'}
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

function App() {
  // State management
  const [waterLevelHistory, setWaterLevelHistory] = useState([]);
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

  // Subscribe to water level updates from Firebase
  useEffect(() => {
    const unsubscribe = subscribeToWaterLevelUpdates((data) => {
      if (data && data.length > 0) {
        // Sort data by timestamp in descending order (newest first)
        const sortedData = [...data].sort((a, b) => b.timestamp - a.timestamp);
        setWaterLevelHistory(sortedData);
        
        // Update current water level from the most recent reading
        const latestReading = sortedData[0];
        setCurrentWaterLevel(latestReading.waterLevel);
        const newStatus = getStatusFromWaterLevel(latestReading.waterLevel);
        setAlertStatus(newStatus);
        
        // Update recommendations and causes when status changes
        setSafetyRecommendations(getRandomSafetyRecommendations(newStatus));
        setPotentialCauses(getRandomPotentialCauses(newStatus));
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);
  
  // Initialize recommendations and causes
  useEffect(() => {
    setSafetyRecommendations(getRandomSafetyRecommendations(alertStatus));
    setPotentialCauses(getRandomPotentialCauses(alertStatus));
  }, [alertStatus]);

  // Filter readings to get one every 3 hours for the historical view
  const filterThreeHourReadings = (readings) => {
    if (!readings || readings.length === 0) return [];
    
    const filteredReadings = [];
    const hourGroups = {};
    
    // Group readings by date and 3-hour blocks
    readings.forEach(reading => {
      const date = format(new Date(reading.timestamp), 'yyyy-MM-dd');
      const hour = new Date(reading.timestamp).getHours();
      const threeHourBlock = Math.floor(hour / 3) * 3;
      const key = `${date}-${threeHourBlock}`;
      
      // If we don't have a reading for this 3-hour block yet, or this one is newer
      if (!hourGroups[key] || reading.timestamp > hourGroups[key].timestamp) {
        hourGroups[key] = reading;
      }
    });
    
    // Convert the grouped readings back to an array
    return Object.values(hourGroups).sort((a, b) => b.timestamp - a.timestamp);
  };
  
  // Apply the filter before passing to formatHistoricalDataForTable
  const threeHourFilteredReadings = filterThreeHourReadings(waterLevelHistory);
  
  // Prepare chart data based on latest readings
  const chartData = {
    labels: threeHourFilteredReadings.slice(0, 8).map(record => {
      const date = new Date(record.timestamp);
      // Format the time to show hour only
      return format(date, 'HH:00');
    }).reverse(),
    datasets: [
      {
        label: 'Waterlevel',
        data: threeHourFilteredReadings.slice(0, 8).map(record => {
          // Convert percentage to cm for display
          return (record.waterLevel / 10 * 100).toFixed(1);
        }).reverse(),
        fill: false,
        backgroundColor: 'rgba(37, 99, 235, 0.2)',
        borderColor: '#2563eb',
        borderWidth: 2,
        pointBackgroundColor: '#2563eb',
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.2,
      },
    ],
  };

  // Chart options configuration
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
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
            const index = context[0].dataIndex;
            // We need to reverse the index because we reversed the data for display
            const reversedIndex = threeHourFilteredReadings.slice(0, 8).length - 1 - index;
            const record = threeHourFilteredReadings.slice(0, 8)[reversedIndex];
            if (record) {
              const date = new Date(record.timestamp);
              return format(date, 'MMMM d, yyyy');
            }
            return '';
          },
          label: (context) => {
            const index = context.dataIndex;
            // We need to reverse the index because we reversed the data for display
            const reversedIndex = threeHourFilteredReadings.slice(0, 8).length - 1 - index;
            const record = threeHourFilteredReadings.slice(0, 8)[reversedIndex];
            if (record) {
              const date = new Date(record.timestamp);
              return [
                `${format(date, 'HH:mm')}`,
                `Waterlevel: ${(record.waterLevel / 10 * 100).toFixed(1)}cm`
              ];
            }
            return '';
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        title: {
          display: true,
          text: 'Values'
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
          display: false
        },
        grid: {
          display: false
        }
      }
    },
    elements: {
      line: {
        tension: 0.2
      }
    }
  };

  // Format historical data for table display by date and hour
  const formatHistoricalDataForTable = () => {
    // Group readings by date first
    const dateGroups = {};
    
    threeHourFilteredReadings.forEach(reading => {
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
                                  {(reading.waterLevel / 10 * 100).toFixed(1)}cm
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
                  <div className="status-title">Current Water Level Status</div>
                  <div className="status-value">
                    {alertStatus === 'normal' && 'Normal'}
                    {alertStatus === 'warning' && 'Warning'}
                    {alertStatus === 'danger' && 'Danger'}
                    {alertStatus === 'unknown' && 'Unknown'}
                  </div>
                </div>

                <div className={`status-box ${alertStatus}`}>
                  <div className="status-title">Alert Status</div>
                  <div className="status-value">
                    {alertStatus === 'normal' && 'Safe'}
                    {alertStatus === 'warning' && 'Prepare for possible evacuation'}
                    {alertStatus === 'danger' && 'Evacuate immediately'}
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
                data={chartData}
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

