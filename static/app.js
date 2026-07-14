let currentLogInterval = null;

window.switchTab = (tabId) => {
    document.querySelectorAll('.content').forEach(el => el.style.display = 'none');
    document.getElementById(`tab-${tabId}`).style.display = 'block';
    
    document.querySelectorAll('.sidebar nav a').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
};

const maxDataPoints = 60;
const commonChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    scales: { x: { display: false }, y: { min: 0, max: 100, display: false } },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    elements: { point: { radius: 0 }, line: { tension: 0.2, borderWidth: 2 } }
};

const cpuChart = new Chart(document.getElementById('cpuChart').getContext('2d'), {
    type: 'line',
    data: { labels: Array(maxDataPoints).fill(''), datasets: [{ data: Array(maxDataPoints).fill(0), borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', fill: true }] },
    options: commonChartOptions
});

const memChart = new Chart(document.getElementById('memChart').getContext('2d'), {
    type: 'line',
    data: { labels: Array(maxDataPoints).fill(''), datasets: [{ data: Array(maxDataPoints).fill(0), borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', fill: true }] },
    options: commonChartOptions
});

const fetchSystemStats = async () => {
    try {
        const res = await fetch('/api/system');
        const data = await res.json();
        
        const cpuVal = data.cpu_usage;
        document.getElementById('cpu-pct').innerText = `${cpuVal.toFixed(2)}%`;
        const cpuData = cpuChart.data.datasets[0].data;
        cpuData.push(cpuVal);
        if (cpuData.length > maxDataPoints) cpuData.shift();
        cpuChart.update();

        const usedMB = data.used_memory / 1024 / 1024;
        const totalMB = data.total_memory / 1024 / 1024;
        const memPercent = (data.used_memory / data.total_memory) * 100;
        document.getElementById('mem-raw').innerText = `${usedMB.toFixed(0)} / ${totalMB.toFixed(0)} MB`;
        document.getElementById('mem-pct').innerText = `${memPercent.toFixed(2)}%`;
        const memData = memChart.data.datasets[0].data;
        memData.push(memPercent);
        if (memData.length > maxDataPoints) memData.shift();
        memChart.update();
    } catch (err) {}
};

let allSystemPorts = [];

const renderSystemPorts = () => {
    const listEl = document.getElementById('all-ports-list');
    const query = document.getElementById('port-search') ? document.getElementById('port-search').value.toLowerCase() : '';
    
    const filtered = allSystemPorts.filter(p => {
        return p.command.toLowerCase().includes(query) ||
               p.port.includes(query) ||
               p.pid.includes(query) ||
               (p.exe_path && p.exe_path.toLowerCase().includes(query));
    });

    if (filtered.length === 0) {
        return listEl.innerHTML = '<tr><td colspan="6" class="empty-state">No open ports detected.</td></tr>';
    }

    listEl.innerHTML = filtered.map(p => `<tr>
        <td><strong>${p.command}</strong></td>
        <td>${p.pid}</td>
        <td><span class="copyable" onclick="copyToClipboard('${p.port}')" title="Click to copy">${p.port}</span></td>
        <td>${p.user}</td>
        <td>
            ${p.exe_path ? `<div class="code-font copyable" onclick="copyToClipboard('${p.exe_path.replace(/\\/g, '\\\\')}')" title="Copy Executable">Exe: ${p.exe_path}</div>` : ''}
            ${p.cwd ? `<div class="code-font copyable" onclick="copyToClipboard('${p.cwd.replace(/\\/g, '\\\\')}')" title="Copy Directory">Dir: ${p.cwd}</div>` : ''}
        </td>
        <td style="white-space: nowrap;">
            <div style="font-size: 0.85rem;">CPU: <span style="color:var(--warning); font-weight: bold;">${p.cpu_usage != null ? p.cpu_usage.toFixed(1) : 0}%</span></div>
            <div style="font-size: 0.85rem;">RAM: <span style="color:var(--success); font-weight: bold;">${p.memory_mb != null ? p.memory_mb.toFixed(1) : 0} MB</span></div>
            ${p.max_memory_mb > 0 ? `<div style="font-size: 0.75rem; color:var(--text-muted); margin-top:2px;">(Min: ${p.min_memory_mb.toFixed(1)} | Max: ${p.max_memory_mb.toFixed(1)})</div>` : ''}
        </td>
        <td>
            <div class="actions-group">
                <button class="btn-secondary" title="Add to Favorites" onclick="promoteToFavorite('${p.command}', '${(p.exe_path||'').replace(/\\/g, '\\\\')}', '${(p.cwd||'').replace(/\\/g, '\\\\')}')">⭐</button>
                <button class="btn-danger" title="Force Kill Process" onclick="killSystemProcess('${p.pid}')">🛑</button>
            </div>
        </td>
    </tr>`).join('');
};

document.getElementById('port-search').addEventListener('input', renderSystemPorts);

const fetchAllPorts = async () => {
    try {
        const res = await fetch('/api/all-ports');
        allSystemPorts = await res.json();
        renderSystemPorts();
    } catch (err) {}
};

const fetchServices = async () => {
    try {
        const res = await fetch('/api/services');
        const services = await res.json();
        const listEl = document.getElementById('services-list');
        if (services.length === 0) return listEl.innerHTML = '<p class="empty-state" style="color:var(--text-muted); font-size:0.875rem;">No folders hosted.</p>';
        listEl.innerHTML = services.map(s => `<div class="hosted-item">
            <div><div style="font-size:0.75rem; color:var(--text-muted);">Port ${s.port}</div><div class="code-font" style="margin-top:2px;">${s.path}</div></div>
            <div><button class="btn-danger" onclick="stopService(${s.port})">Stop</button></div>
        </div>`).join('');
    } catch (err) {}
};

const fetchFavorites = async () => {
    try {
        const res = await fetch('/api/favorites');
        const favs = await res.json();
        const listEl = document.getElementById('fav-list');
        if (favs.length === 0) return listEl.innerHTML = '<tr><td colspan="5" class="empty-state">No favorite projects yet.</td></tr>';
            listEl.innerHTML = favs.map(f => {
            let actionButtons = '';
            let logBtn = '';
            
            if (f.status === 'stopped') {
                actionButtons = `<button class="btn-primary" onclick="favAction('${f.config.id}', 'run')">Run</button>`;
            } else if (f.status === 'running_externally') {
                actionButtons = `<button class="btn-primary" disabled title="Running outside Port Monitor" style="opacity: 0.5; cursor: not-allowed;">External</button>`;
            } else if (f.status === 'running') {
                actionButtons = `
                    <button class="btn-warning" onclick="favAction('${f.config.id}', 'pause')">Pause</button>
                    <button class="btn-danger" onclick="favAction('${f.config.id}', 'stop')">Stop</button>
                `;
                logBtn = `<button class="btn-secondary" onclick="viewLogs('${f.config.id}', '${f.config.name}')">Logs</button>`;
            } else if (f.status === 'paused') {
                actionButtons = `
                    <button class="btn-primary" onclick="favAction('${f.config.id}', 'resume')">Resume</button>
                    <button class="btn-danger" onclick="favAction('${f.config.id}', 'stop')">Stop</button>
                `;
                logBtn = `<button class="btn-secondary" onclick="viewLogs('${f.config.id}', '${f.config.name}')">Logs</button>`;
            }

            let statusBadge = f.status === 'running' ? '<span class="status-badge running">Running</span>' : 
                              f.status === 'paused' ? '<span class="status-badge">Paused</span>' : 
                              f.status === 'running_externally' ? '<span class="status-badge running" style="background:var(--warning);color:black;">External</span>' :
                              '<span class="status-badge stopped">Stopped</span>';

            return `<tr>
                <td><strong>${f.config.name}</strong></td>
                <td><span class="code-font">${f.config.command}</span></td>
                <td><span class="code-font" style="font-size:0.7rem;">${f.config.cwd}</span></td>
                <td>${statusBadge}</td>
                <td>
                    <div class="actions-group">
                        ${actionButtons}
                        ${logBtn}
                        <button class="btn-secondary" onclick="removeFav('${f.config.id}')" title="Remove">🗑️</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    } catch (err) {}
};

document.getElementById('fav-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('fav-name').value;
    const command = document.getElementById('fav-cmd').value;
    const cwd = document.getElementById('fav-dir').value;
    await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '', name, command, cwd })
    });
    document.getElementById('fav-name').value = '';
    document.getElementById('fav-cmd').value = '';
    document.getElementById('fav-dir').value = '';
    fetchFavorites();
});

window.favAction = async (id, action) => {
    await fetch(`/api/favorites/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
    });
    fetchFavorites();
};

window.delFav = async (id) => {
    if(confirm('Delete project?')) {
        await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
        fetchFavorites();
    }
}

document.getElementById('host-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await fetch('/api/host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: document.getElementById('path').value, port: parseInt(document.getElementById('port').value) })
    });
    document.getElementById('path').value = '';
    document.getElementById('port').value = '';
    fetchServices();
});

window.stopService = async (port) => {
    await fetch(`/api/host/${port}`, { method: 'DELETE' });
    fetchServices();
};

window.browseFolder = async (inputId) => {
    try {
        const res = await fetch('/api/dialog/folder');
        if (res.ok) {
            const path = await res.text();
            document.getElementById(inputId).value = path;
        }
    } catch (err) {
        console.error('Failed to open dialog', err);
    }
};

window.viewLogs = (id, name) => {
    document.getElementById('log-title').innerText = `Logs: ${name}`;
    document.getElementById('log-modal').style.display = 'flex';
    document.getElementById('log-viewer').innerText = 'Fetching logs...';
    
    if (currentLogInterval) clearInterval(currentLogInterval);
    
    const fetchLogs = async () => {
        try {
            const res = await fetch(`/api/favorites/${id}/logs`);
            const logs = await res.json();
            const viewer = document.getElementById('log-viewer');
            const isScrolledToBottom = viewer.scrollHeight - viewer.clientHeight <= viewer.scrollTop + 10;
            
            viewer.innerText = logs.length > 0 ? logs.join('\\n') : 'No logs available yet...';
            
            if (isScrolledToBottom) {
                viewer.scrollTop = viewer.scrollHeight;
            }
        } catch (e) {}
    };
    
    fetchLogs();
    currentLogInterval = setInterval(fetchLogs, 1000);
};

window.closeLogs = () => {
    document.getElementById('log-modal').style.display = 'none';
    if (currentLogInterval) clearInterval(currentLogInterval);
};

window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
};

window.killSystemProcess = async (pid) => {
    if(confirm(`Are you sure you want to FORCE KILL process PID ${pid}?`)) {
        await fetch(`/api/system/process/${pid}`, { method: 'DELETE' });
        fetchAllPorts();
    }
};

window.promoteToFavorite = (command, exe_path, cwd) => {
    switchTab('favorites');
    document.getElementById('fav-name').value = command.charAt(0).toUpperCase() + command.slice(1);
    document.getElementById('fav-cmd').value = exe_path || command;
    document.getElementById('fav-dir').value = cwd || '/';
};

fetchSystemStats();
fetchServices();
fetchAllPorts();
fetchFavorites();

setInterval(fetchSystemStats, 1000);
setInterval(fetchServices, 2000);
setInterval(fetchAllPorts, 3000);
setInterval(fetchFavorites, 2000);
