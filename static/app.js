// Initialization
window.fetchSystemStats();
window.fetchAllPorts();
window.fetchFavorites();

// Start Intervals
setInterval(window.fetchSystemStats, 1000);
setInterval(window.fetchAllPorts, 3000);
setInterval(window.fetchFavorites, 2000);
