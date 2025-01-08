document.addEventListener('DOMContentLoaded', () => {
    // API Constants
    const GEMINI_API_KEY = 'AIzaSyCfSagTjsbHlp_ukim8qxEiIzrHrLBdwvs';
    const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';

    // Initialize map with higher zoom level
    const map = L.map('map', {
        zoomControl: false,  // Disable default zoom controls
        dragging: true,      // Allow dragging
        touchZoom: true,     // Allow touch zoom
        scrollWheelZoom: false, // Disable scroll wheel zoom
        doubleClickZoom: true,  // Allow double click zoom
        boxZoom: false,         // Disable box zoom
    }).setView([0, 0], 2);

    // Add custom zoom control to better position
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // Add tile layer with custom options
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
        minZoom: 3
    }).addTo(map);

    let marker = null;
    let circle = null;

    // Search functionality
    const searchButton = document.getElementById('search-button');
    const searchInput = document.getElementById('search-input');

    searchButton.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });

    function handleSearch() {
        const query = searchInput.value.trim();
        if (query) {
            searchButton.classList.add('loading');
            searchButton.disabled = true;
            searchInput.disabled = true; // Disable input while searching
            
            searchLocation(query)
                .finally(() => {
                    searchButton.classList.remove('loading');
                    searchButton.disabled = false;
                    searchInput.disabled = false; // Re-enable input
                    searchInput.focus(); // Return focus to input
                });
        }
    }

    // Location button functionality
    const locationButton = document.getElementById('location-button');
    locationButton.addEventListener('click', () => {
        if (navigator.geolocation) {
            locationButton.classList.add('loading');
            locationButton.disabled = true;
            locationButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting location...';
            
            // Watch position instead of getting it once
            const watchId = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude, accuracy } = position.coords;
                    
                    // Clear the watch after getting accurate position
                    if (accuracy <= 100) { // accuracy in meters
                        navigator.geolocation.clearWatch(watchId);
                        reverseGeocode(latitude, longitude);
                    } else if (marker === null) {
                        // Show initial position even if not very accurate
                        reverseGeocode(latitude, longitude);
                    }
                },
                (error) => {
                    handleLocationError(error);
                    resetLocationButton();
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0,
                    maximumAge: 0
                }
            );

            // Timeout after 15 seconds
            setTimeout(() => {
                navigator.geolocation.clearWatch(watchId);
            }, 15000);
        } else {
            alert('Geolocation is not supported by your browser');
        }
    });

    function handleLocationError(error) {
        let message = 'Error getting location: ';
        switch(error.code) {
            case error.PERMISSION_DENIED:
                message += 'Location permission denied';
                break;
            case error.POSITION_UNAVAILABLE:
                message += 'Location information unavailable';
                break;
            case error.TIMEOUT:
                message += 'Location request timed out';
                break;
            default:
                message += 'Unknown error occurred';
        }
        alert(message);
    }

    async function reverseGeocode(lat, lon) {
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
            const data = await response.json();
            const locationName = data.display_name || 'Your Location';
            updateMap(lat, lon, locationName);
        } catch (error) {
            updateMap(lat, lon, 'Your Location');
        } finally {
            resetLocationButton();
        }
    }

    function resetLocationButton() {
        locationButton.classList.remove('loading');
        locationButton.disabled = false;
        locationButton.innerHTML = '<i class="fas fa-location-dot"></i> Use My Location';
    }

    async function searchLocation(query) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?` + 
                `q=${encodeURIComponent(query)}&` +
                `format=json&` +
                `limit=1`
            );

            const data = await response.json();

            if (data && data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lon = parseFloat(result.lon);
                
                // Show the main searched location
                updateMap(lat, lon, result.display_name);
                
                // Show loading state for places
                document.querySelector('.loading-places').classList.add('active');
                
                // Get popular places using Gemini
                await getPopularPlaces(query);
            } else {
                alert('Location not found. Please check the spelling.');
            }
        } catch (error) {
            console.error('Search error:', error);
            alert('Error searching location. Please try again.');
        } finally {
            document.querySelector('.loading-places').classList.remove('active');
        }
    }

    async function getPopularPlaces(location) {
        try {
            const prompt = `List exactly 5 most popular tourist places in ${location}. For each place, provide: 1) Place name 2) A 20-word description about why to visit. Format as JSON with fields: name, description`;

            const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            if (!response.ok) {
                throw new Error('Failed to fetch from Gemini API');
            }

            const data = await response.json();
            
            // Parse the response text as JSON
            let places;
            try {
                const placesText = data.candidates[0].content.parts[0].text;
                // Remove any markdown formatting if present
                const jsonStr = placesText.replace(/```json\n?|\n?```/g, '');
                places = JSON.parse(jsonStr);
            } catch (e) {
                console.error('Error parsing Gemini response:', e);
                throw new Error('Invalid response format from Gemini');
            }

            // Clear existing places
            const placesGrid = document.querySelector('.places-grid');
            placesGrid.innerHTML = '';

            // Add place cards
            if (Array.isArray(places)) {
                places.forEach(place => {
                    const card = createPlaceCard(place);
                    placesGrid.appendChild(card);
                });
                
                // Show print button after places are loaded
                const printButton = document.getElementById('print-places');
                printButton.style.display = 'flex';
            } else {
                throw new Error('Invalid places data format');
            }

        } catch (error) {
            console.error('Error getting popular places:', error);
            document.querySelector('.places-grid').innerHTML = `
                <div class="error-message">
                    Unable to load popular places at this time. ${error.message}
                </div>
            `;
        }
    }

    function createPlaceCard(place) {
        // Define badges for different popularity levels
        const popularityBadges = {
            1: { text: 'Most Visited', color: '#ef4444', bg: '#fee2e2' },
            2: { text: 'Highly Popular', color: '#2563eb', bg: '#dbeafe' },
            3: { text: 'Tourist Favorite', color: '#047857', bg: '#d1fae5' },
            4: { text: 'Worth Visiting', color: '#7c3aed', bg: '#ede9fe' },
            5: { text: 'Hidden Gem', color: '#d97706', bg: '#fef3c7' }
        };

        // Generate random popularity index and visit count
        const popularityIndex = Math.floor(Math.random() * 5) + 1;
        const visitCount = Math.floor(Math.random() * 5000) + 1000;
        const badge = popularityBadges[popularityIndex];

        const card = document.createElement('div');
        card.className = 'place-card';
        card.innerHTML = `
            <div class="place-info">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                ">
                    <h3 class="place-name">${place.name}</h3>
                    <span style="
                        background: ${badge.bg};
                        color: ${badge.color};
                        padding: 4px 12px;
                        border-radius: 20px;
                        font-size: 0.75rem;
                        font-weight: 600;
                    ">${badge.text}</span>
                </div>
                <p class="place-description">${place.description}</p>
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    margin-top: 12px;
                    color: #6b7280;
                    font-size: 0.9rem;
                ">
                    <i class="fas fa-users" style="color: #2563eb;"></i>
                    <span style="font-weight: 600;">${visitCount.toLocaleString()}</span>
                    <span>visitors this month</span>
                </div>
                <div class="card-actions" style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 15px;
                    padding-top: 15px;
                    border-top: 1px solid #e5e7eb;
                ">
                    <div class="visitor-info">
                        <i class="fas fa-users" style="color: #2563eb;"></i>
                        <span style="font-weight: 600;">${visitCount.toLocaleString()}</span>
                        <span>visitors this month</span>
                    </div>
                    <button class="start-navigation" style="
                        background: #2563eb;
                        color: white;
                        padding: 8px 16px;
                        border-radius: 8px;
                        border: none;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-directions"></i>
                        Start Now
                    </button>
                </div>
            </div>
        `;

        // Add click handler for the Start Now button
        const startButton = card.querySelector('.start-navigation');
        startButton.addEventListener('click', () => {
            // Store destination details in localStorage
            localStorage.setItem('destination', JSON.stringify({
                name: place.name,
                description: place.description
            }));
            // Redirect to directions page
            window.open('directions.html', '_blank');
        });

        return card;
    }

    async function handleNavigation(place) {
        try {
            // First try to get current location
            const position = await getCurrentLocation();
            showDirections(position, place);
        } catch (error) {
            // If automatic location fails, show manual input
            showLocationInput(place);
        }
    }

    function updateMap(lat, lon, title) {
        const position = [lat, lon];

        if (marker) map.removeLayer(marker);
        if (circle) map.removeLayer(circle);

        // Add marker first
        marker = createMarker(position).addTo(map);

        // Clean up the display name
        const cleanTitle = title.split(',')
            .slice(0, 3)  // Take first 3 parts of the address
            .join(',')
            .trim();
        
        marker.bindPopup(`<b>${cleanTitle}</b>`).openPopup();

        // Add accuracy circle
        circle = L.circle(position, {
            color: '#2563eb',
            fillColor: '#2563eb',
            fillOpacity: 0.15,
            radius: 300  // Increased radius for better visibility
        }).addTo(map);

        // Set view with better zoom level
        map.setView(position, 14, {
            animate: true,
            pan: {
                duration: 1
            }
        });
    }

    function createMarker(position) {
        return L.marker(position, {
            icon: L.divIcon({
                className: 'custom-marker',
                html: `<div class="marker-pin"></div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            })
        });
    }

    async function getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported by your browser'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lon: position.coords.longitude
                    });
                },
                (error) => {
                    reject(error);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }

    function showLocationInput(place) {
        // Create modal for location input
        const modal = document.createElement('div');
        modal.className = 'location-modal';
        modal.innerHTML = `
            <div class="modal-content" style="
                background: white;
                padding: 20px;
                border-radius: 12px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                max-width: 400px;
                width: 90%;
            ">
                <h3 style="margin-bottom: 15px;">Enter Your Location</h3>
                <input type="text" id="location-input" placeholder="Enter your current location" style="
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #e5e7eb;
                    border-radius: 8px;
                    margin-bottom: 15px;
                ">
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button id="cancel-location" style="
                        padding: 8px 16px;
                        border: 1px solid #e5e7eb;
                        border-radius: 8px;
                        background: white;
                        cursor: pointer;
                    ">Cancel</button>
                    <button id="confirm-location" style="
                        padding: 8px 16px;
                        background: #2563eb;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                    ">Confirm</button>
                </div>
            </div>
        `;

        // Add modal styles
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;

        document.body.appendChild(modal);

        // Handle modal interactions
        const input = modal.querySelector('#location-input');
        const cancelBtn = modal.querySelector('#cancel-location');
        const confirmBtn = modal.querySelector('#confirm-location');

        cancelBtn.addEventListener('click', () => modal.remove());
        confirmBtn.addEventListener('click', async () => {
            const location = input.value.trim();
            if (location) {
                try {
                    const response = await fetch(
                        `https://nominatim.openstreetmap.org/search?` + 
                        `q=${encodeURIComponent(location)}&` +
                        `format=json&` +
                        `limit=1`
                    );
                    const data = await response.json();
                    
                    if (data && data.length > 0) {
                        const startLocation = {
                            lat: parseFloat(data[0].lat),
                            lon: parseFloat(data[0].lon)
                        };
                        showDirections(startLocation, place);
                        modal.remove();
                    } else {
                        alert('Location not found. Please try again.');
                    }
                } catch (error) {
                    alert('Error finding location. Please try again.');
                }
            }
        });
    }

    function showDirections(from, to) {
        // Clear existing route if any
        if (window.currentRoute) {
            map.removeLayer(window.currentRoute);
        }

        // Get coordinates for destination
        fetch(
            `https://nominatim.openstreetmap.org/search?` + 
            `q=${encodeURIComponent(to.name)}&` +
            `format=json&` +
            `limit=1`
        )
        .then(response => response.json())
        .then(data => {
            if (data && data.length > 0) {
                const destination = {
                    lat: parseFloat(data[0].lat),
                    lon: parseFloat(data[0].lon)
                };

                // Show both points on map
                const bounds = L.latLngBounds(
                    [from.lat, from.lon],
                    [destination.lat, destination.lon]
                );
                map.fitBounds(bounds, { padding: [50, 50] });

                // Add markers
                if (marker) map.removeLayer(marker);
                if (circle) map.removeLayer(circle);

                L.marker([from.lat, from.lon], {
                    icon: L.divIcon({
                        className: 'custom-marker',
                        html: '<div class="marker-pin" style="background: #047857;"></div>',
                        iconSize: [30, 30],
                        iconAnchor: [15, 30]
                    })
                }).addTo(map).bindPopup('Your Location');

                L.marker([destination.lat, destination.lon], {
                    icon: L.divIcon({
                        className: 'custom-marker',
                        html: '<div class="marker-pin" style="background: #ef4444;"></div>',
                        iconSize: [30, 30],
                        iconAnchor: [15, 30]
                    })
                }).addTo(map).bindPopup(to.name);

                // Draw a line between points
                window.currentRoute = L.polyline(
                    [[from.lat, from.lon], [destination.lat, destination.lon]],
                    { color: '#2563eb', weight: 3 }
                ).addTo(map);
            }
        })
        .catch(error => {
            console.error('Error showing directions:', error);
            alert('Error showing directions. Please try again.');
        });
    }

    // Add this CSS for error message
    const style = document.createElement('style');
    style.textContent = `
        .error-message {
            text-align: center;
            padding: 2rem;
            color: #ef4444;
            background: #fee2e2;
            border-radius: 8px;
            grid-column: 1 / -1;
        }
    `;
    document.head.appendChild(style);

    // Add print functionality
    document.getElementById('print-places').addEventListener('click', () => {
        // Create a print-specific container
        const printTitle = document.createElement('div');
        printTitle.className = 'print-header';
        printTitle.innerHTML = `
            <h1>Popular Tourist Spots in ${document.getElementById('search-input').value}</h1>
            <div class="print-timestamp">Generated on ${new Date().toLocaleDateString()}</div>
        `;

        // Add to document
        const placesSection = document.querySelector('.popular-places');
        placesSection.insertBefore(printTitle, placesSection.firstChild);

        // Force print dialog
        setTimeout(() => {
            window.print();
            
            // Remove print elements after printing
            placesSection.removeChild(printTitle);
        }, 100);
    });
}); 