document.addEventListener('DOMContentLoaded', () => {
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

    // Get destination details from localStorage
    const destination = JSON.parse(localStorage.getItem('destination'));
    document.getElementById('place-name').textContent = destination.name;

    // Add this function to calculate estimated times
    function calculateTravelTimes(start, end) {
        // Calculate straight-line distance in kilometers
        const R = 6371; // Earth's radius in km
        const lat1 = start[0] * Math.PI / 180;
        const lat2 = end[0] * Math.PI / 180;
        const dLat = (end[0] - start[0]) * Math.PI / 180;
        const dLon = (end[1] - start[1]) * Math.PI / 180;

        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1) * Math.cos(lat2) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;

        // Estimate times based on average speeds
        const times = {
            car: Math.round(distance / 50 * 60), // 50 km/h average
            bike: Math.round(distance / 15 * 60), // 15 km/h average
            walk: Math.round(distance / 5 * 60), // 5 km/h average
            train: Math.round(distance / 40 * 60) // 40 km/h average
        };

        return times;
    }

    // Update the showDirections function to include time calculations
    window.showDirections = async function() {
        const currentLocation = document.getElementById('current-location').value.trim();
        
        if (!currentLocation) {
            alert('Please enter your current location');
            return;
        }

        try {
            // Get coordinates for current location
            const startResponse = await fetch(
                `https://nominatim.openstreetmap.org/search?` + 
                `q=${encodeURIComponent(currentLocation)}&` +
                `format=json&limit=1`
            );
            const startData = await startResponse.json();

            // Get coordinates for destination
            const destResponse = await fetch(
                `https://nominatim.openstreetmap.org/search?` + 
                `q=${encodeURIComponent(destination.name)}&` +
                `format=json&limit=1`
            );
            const destData = await destResponse.json();

            if (startData.length > 0 && destData.length > 0) {
                const start = [startData[0].lat, startData[0].lon];
                const end = [destData[0].lat, destData[0].lon];

                // Calculate travel times
                const times = calculateTravelTimes(start, end);

                // Show the travel-times container
                const travelTimes = document.querySelector('.travel-times');
                travelTimes.style.display = 'flex';

                // Update the time cards
                document.querySelectorAll('.time-card').forEach(card => {
                    const mode = card.querySelector('.mode').textContent.toLowerCase();
                    const duration = card.querySelector('.duration');
                    let time = 0;

                    if (mode.includes('car')) time = times.car;
                    else if (mode.includes('bike')) time = times.bike;
                    else if (mode.includes('foot')) time = times.walk;
                    else if (mode.includes('train')) time = times.train;

                    // Format time display
                    if (time < 60) {
                        duration.textContent = `${time} mins`;
                    } else {
                        const hours = Math.floor(time / 60);
                        const mins = time % 60;
                        duration.textContent = mins > 0 ? 
                            `${hours} hr ${mins} min` : 
                            `${hours} hr`;
                    }
                });

                // Add markers
                L.marker(start).addTo(map).bindPopup('Your Location');
                L.marker(end).addTo(map).bindPopup(destination.name);

                // Draw route line
                const route = L.polyline([start, end], {color: '#2563eb'}).addTo(map);

                // Fit map to show both points
                map.fitBounds(route.getBounds(), {padding: [50, 50]});
            } else {
                alert('Could not find one or both locations. Please try again.');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error getting directions. Please try again.');
        }
    };
}); 