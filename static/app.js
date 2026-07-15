let currentLogInterval = null;

let currentFaviconHasError = null;
function updateFavicon(hasError) {
    if (currentFaviconHasError === hasError) return;
    currentFaviconHasError = hasError;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    // Draw base icon (Dark rounded square)
    ctx.fillStyle = '#1e1e1e';
    ctx.beginPath();
    ctx.roundRect(0, 0, 32, 32, 8);
    ctx.fill();

    // Draw 'PM' text
    ctx.fillStyle = '#8b5cf6';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PM', 16, 17);

    if (hasError) {
        // Draw red dot
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(26, 6, 6, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.strokeStyle = '#1e1e1e';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    const dataUrl = canvas.toDataURL('image/png');
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.href = dataUrl;
}
updateFavicon(false);

window.switchTab = (tabId) => {
    document.querySelectorAll('.content').forEach(el => el.style.display = 'none');
    document.getElementById(`tab-${tabId}`).style.display = 'flex';
    
    document.querySelectorAll('.sidebar nav a').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
};

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
        return listEl.innerHTML = '<tr><td colspan="7" class="empty-state">No open ports detected.</td></tr>';
    }

    const grouped = {};
    filtered.forEach(p => {
        if (!grouped[p.pid]) {
            grouped[p.pid] = { ...p, ports: [p.port] };
        } else {
            if (!grouped[p.pid].ports.includes(p.port)) {
                grouped[p.pid].ports.push(p.port);
                // Sort ports numerically
                grouped[p.pid].ports.sort((a, b) => parseInt(a) - parseInt(b));
            }
        }
    });

    listEl.innerHTML = Object.values(grouped).map(p => `<tr>
        <td><strong>${p.command}</strong></td>
        <td>${p.pid}</td>
        <td><span class="copyable" onclick="copyToClipboard('${p.ports.join(', ')}')\" title=\"Click to copy\">${p.ports.join(', ')}</span></td>
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
                <button class="btn-secondary" title="Add to Favorites" onclick="promoteToFavorite('${p.command}', '${(p.exe_path||'').replace(/\\/g, '\\\\')}', '${(p.cwd||'').replace(/\\/g, '\\\\')}')"><i data-feather="star" style="width: 14px; height: 14px;"></i></button>
                <button class="btn-danger" title="Force Kill Process" onclick="killSystemProcess('${p.pid}')"><i data-feather="x-circle" style="width: 14px; height: 14px;"></i></button>
            </div>
        </td>
    </tr>`).join('');
    if (window.feather) feather.replace();
};

document.getElementById('port-search').addEventListener('input', renderSystemPorts);

const fetchAllPorts = async () => {
    try {
        const res = await fetch('/api/all-ports');
        allSystemPorts = await res.json();
        renderSystemPorts();
    } catch (err) {}
};



const fetchFavorites = async () => {
    // Prevent UI refresh if user is currently typing in the command override input
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT' && activeEl.id.startsWith('cmd-in-')) {
        return;
    }

    try {
        const res = await fetch('/api/favorites');
        const favs = await res.json();
        
        // Update Favicon dot
        const anyError = favs.some(f => f.has_error);
        updateFavicon(anyError);

        const listEl = document.getElementById('fav-list');
        if (favs.length === 0) return listEl.innerHTML = '<tr><td colspan="5" class="empty-state">No favorite projects yet.</td></tr>';
            listEl.innerHTML = favs.map(f => {
            let actionButtons = '';
            let logBtn = '';
            
            if (f.status === 'stopped') {
                actionButtons = `<button class="btn-primary" onclick="favAction('${f.config.id}', 'run', document.getElementById('cmd-in-${f.config.id}').value)" style="display: flex; align-items: center; gap: 4px;"><i data-feather="play" style="width: 14px; height: 14px;"></i> Run</button>`;
                logBtn = `<button class="btn-secondary" onclick="viewLogs('${f.config.id}')" title="View Logs" style="display: flex; align-items: center; gap: 4px; position: relative;">
                    <i data-feather="file-text" style="width: 14px; height: 14px;"></i> Logs
                    ${f.has_error ? '<span style="position:absolute; top:-2px; right:-2px; width:8px; height:8px; background:var(--danger); border-radius:50%; box-shadow:0 0 4px var(--danger);"></span>' : ''}
                </button>`;
            } else if (f.status === 'running_externally') {
                actionButtons = `<button class="btn-danger" onclick="killSystemProcess('${f.ext_pid}')" title="Kill Orphaned Process" style="display: flex; align-items: center; gap: 4px;"><i data-feather="x-circle" style="width: 14px; height: 14px;"></i> Kill</button>`;
                // No logs for external processes
                logBtn = '';
            } else if (f.status === 'running') {
                actionButtons = `
                    <button class="btn-warning" onclick="favAction('${f.config.id}', 'pause')">Pause</button>
                    <button class="btn-danger" onclick="favAction('${f.config.id}', 'stop')">Stop</button>
                `;
                logBtn = `<button class="btn-secondary" onclick="viewLogs('${f.config.id}')" title="View Logs" style="display: flex; align-items: center; gap: 4px; position: relative;">
                    <i data-feather="file-text" style="width: 14px; height: 14px;"></i> Logs
                    ${f.has_error ? '<span style="position:absolute; top:-2px; right:-2px; width:8px; height:8px; background:var(--danger); border-radius:50%; box-shadow:0 0 4px var(--danger);"></span>' : ''}
                </button>`;
            } else if (f.status === 'paused') {
                actionButtons = `
                    <button class="btn-primary" onclick="favAction('${f.config.id}', 'resume')">Resume</button>
                    <button class="btn-danger" onclick="favAction('${f.config.id}', 'stop')">Stop</button>
                `;
                logBtn = `<button class="btn-secondary" onclick="viewLogs('${f.config.id}')" title="View Logs" style="display: flex; align-items: center; gap: 4px; position: relative;">
                    <i data-feather="file-text" style="width: 14px; height: 14px;"></i> Logs
                    ${f.has_error ? '<span style="position:absolute; top:-2px; right:-2px; width:8px; height:8px; background:var(--danger); border-radius:50%; box-shadow:0 0 4px var(--danger);"></span>' : ''}
                </button>`;
            }

            let statusBadge = f.status === 'running' ? '<span class="status-badge running">Running</span>' : 
                              f.status === 'paused' ? '<span class="status-badge">Paused</span>' : 
                              f.status === 'running_externally' ? '<span class="status-badge running" style="background:var(--warning);color:black;">External</span>' :
                              '<span class="status-badge stopped">Stopped</span>';

            return `<tr>
                <td><strong>${f.config.name}</strong></td>
                <td><input type="text" id="cmd-in-${f.config.id}" value="${f.config.command.replace(/"/g, '&quot;')}" style="background:transparent; border:1px solid rgba(255,255,255,0.1); color:var(--text); font-family:'Fira Code', monospace; font-size:0.8rem; padding:0.25rem 0.5rem; width:100%; min-width:200px; border-radius:4px; outline:none;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'" onchange="favAction('${f.config.id}', 'update', this.value)"></td>
                <td><span class="code-font" style="color:var(--primary); font-weight:bold;">${f.config.port || '-'}</span></td>
                <td><span class="code-font" style="font-size:0.7rem;">${f.config.cwd}</span></td>
                <td>${statusBadge}</td>
                <td>
                    <div class="actions-group">
                        ${actionButtons}
                        ${logBtn}
                        <button class="btn-secondary" onclick="removeFav('${f.config.id}')" title="Remove" style="display: flex; align-items: center; justify-content: center; padding: 0.5rem;"><i data-feather="trash-2" style="width: 14px; height: 14px;"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
        if (window.feather) feather.replace();
    } catch (err) {}
};

document.getElementById('fav-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('fav-name').value;
    const command = document.getElementById('fav-cmd').value;
    const cwd = document.getElementById('fav-dir').value;
    const port = document.getElementById('fav-port').value;
    await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '', name, command, cwd, port: port || null })
    });
    document.getElementById('fav-name').value = '';
    document.getElementById('fav-cmd').value = '';
    document.getElementById('fav-dir').value = '';
    document.getElementById('fav-port').value = '';
    fetchFavorites();
});

window.favAction = async (id, action, command_override = null) => {
    await fetch(`/api/favorites/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, command_override })
    });
    fetchFavorites();
    if (action === 'run') {
        setTimeout(fetchAllPorts, 800); // Give the process time to start and bind its port
    }
};

window.delFav = async (id) => {
    if(confirm('Delete project?')) {
        await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
        fetchFavorites();
    }
}



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

window.viewLogs = async (id) => {
    currentLogId = id;
    
    // Immediately clear error dot in the UI locally to prevent flicker
    const fav = await fetch('/api/favorites').then(res => res.json());
    const project = fav.find(f => f.config.id === id);
    if (project) document.getElementById('log-title').innerText = `Logs: ${project.config.name}`;
    fetchFavorites(); // Refresh to remove the dot

    document.getElementById('log-modal').style.display = 'flex';
    document.getElementById('log-viewer').innerText = 'Fetching logs...';
    
    if (currentLogInterval) clearInterval(currentLogInterval);
    
    const fetchLogs = async () => {
        try {
            const res = await fetch(`/api/favorites/${currentLogId}/logs`);
            const logs = await res.json();
            const viewer = document.getElementById('log-viewer');
            const isScrolledToBottom = viewer.scrollHeight - viewer.clientHeight <= viewer.scrollTop + 10;
            
            if (logs.length > 0) {
                const formattedLogs = logs.map(line => {
                    let html = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    
                    // Highlight Timestamp
                    html = html.replace(/^\[(\d{2}:\d{2}:\d{2})\]/, '<span style="color: #6366f1; font-weight: bold;">[$1]</span>');
                    
                    // Highlight ERROR/WARN/INFO/SUCCESS
                    html = html.replace(/(\[ERROR\]|ERROR:|ERR!|Error:)/g, '<span style="color: #ef4444; font-weight: bold;">$1</span>');
                    html = html.replace(/(\[WARNING\]|WARNING:|WARN|Warning:)/g, '<span style="color: #f59e0b; font-weight: bold;">$1</span>');
                    html = html.replace(/(\[INFO\]|INFO:)/gi, '<span style="color: #3b82f6; font-weight: bold;">$1</span>');
                    html = html.replace(/(Ready to accept connections|Server initialized|Running mode=standalone|starting|success)/gi, '<span style="color: #10b981; font-weight: bold;">$1</span>');
                    
                    // Highlight common IDs/Ports
                    html = html.replace(/(port=\d+)/g, '<span style="color: #8b5cf6; font-weight: 500;">$1</span>');
                    html = html.replace(/(pid=\d+)/g, '<span style="color: #06b6d4; font-weight: 500;">$1</span>');

                    return html;
                });
                viewer.innerHTML = formattedLogs.join('<br>');
            } else {
                viewer.innerHTML = '<span style="color: var(--text-muted);">No logs available yet...</span>';
            }
            
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
fetchAllPorts();
fetchFavorites();

// Table Resizer Logic
const initResizers = () => {
    document.querySelectorAll('.task-table th').forEach(th => {
        if (th.querySelector('.resizer')) return;
        const resizer = document.createElement('div');
        resizer.classList.add('resizer');
        resizer.style.height = '100%';
        th.appendChild(resizer);
        
        let x = 0;
        let w = 0;
        
        const mouseDownHandler = (e) => {
            x = e.clientX;
            w = parseInt(window.getComputedStyle(th).width, 10);
            document.addEventListener('mousemove', mouseMoveHandler);
            document.addEventListener('mouseup', mouseUpHandler);
            resizer.classList.add('resizing');
        };
        
        const mouseMoveHandler = (e) => {
            const dx = e.clientX - x;
            th.style.width = `${w + dx}px`;
            th.style.minWidth = `${w + dx}px`;
        };
        
        const mouseUpHandler = () => {
            resizer.classList.remove('resizing');
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
        };
        
        resizer.addEventListener('mousedown', mouseDownHandler);
    });
};
setTimeout(initResizers, 500);

setInterval(fetchSystemStats, 1000);
setInterval(fetchAllPorts, 3000);
setInterval(fetchFavorites, 2000);
