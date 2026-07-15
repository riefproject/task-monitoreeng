const maxDataPoints = 60;
const commonChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: { 
        x: { display: false }, 
        y: { 
            min: 0, 
            max: 100, 
            display: true, 
            grid: { color: 'rgba(255,255,255,0.05)' }, 
            border: { display: false },
            ticks: { color: 'rgba(255,255,255,0.3)', stepSize: 25 }
        } 
    },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    elements: { point: { radius: 0 }, line: { tension: 0.2, borderWidth: 2 } }
};

window.cpuChart = new Chart(document.getElementById('cpuChart').getContext('2d'), {
    type: 'line',
    data: { labels: Array(maxDataPoints).fill(''), datasets: [{ data: Array(maxDataPoints).fill(0), borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', fill: true }] },
    options: commonChartOptions
});

window.memChart = new Chart(document.getElementById('memChart').getContext('2d'), {
    type: 'line',
    data: { labels: Array(maxDataPoints).fill(''), datasets: [{ data: Array(maxDataPoints).fill(0), borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true }] },
    options: commonChartOptions
});

window.fetchSystemStats = async () => {
    try {
        const res = await fetch('/api/system');
        const data = await res.json();
        
        const cpuVal = data.cpu_usage;
        document.getElementById('cpu-pct').innerText = `${cpuVal.toFixed(2)}%`;
        const cpuData = window.cpuChart.data.datasets[0].data;
        cpuData.push(cpuVal);
        if (cpuData.length > maxDataPoints) cpuData.shift();
        window.cpuChart.update();

        const usedMB = data.used_memory / 1024 / 1024;
        const totalMB = data.total_memory / 1024 / 1024;
        const memPercent = (data.used_memory / data.total_memory) * 100;
        document.getElementById('mem-raw').innerText = `${usedMB.toFixed(0)} / ${totalMB.toFixed(0)} MB`;
        document.getElementById('mem-pct').innerText = `${memPercent.toFixed(2)}%`;
        const memData = window.memChart.data.datasets[0].data;
        memData.push(memPercent);
        if (memData.length > maxDataPoints) memData.shift();
        window.memChart.update();
    } catch (err) {}
};
