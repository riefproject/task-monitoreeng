window.allSystemPorts = [];

window.renderSystemPorts = () => {
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
                <button class="btn-secondary icon-btn" title="Add to Favorites" onclick="promoteToFavorite('${p.command}', '${(p.exe_path||'').replace(/\\/g, '\\\\')}', '${(p.cwd||'').replace(/\\/g, '\\\\')}')"><img src="assets/svg/star.svg" style="width:14px;height:14px; filter:invert(1);"></button>
                <button class="btn-danger icon-btn" title="Stop Safely (SIGTERM)" onclick="stopSystemProcess('${p.pid}')"><img src="assets/svg/pause.svg" style="width:14px;height:14px; filter:invert(1);"></button>
                <button class="btn-danger icon-btn" title="Force Kill Process (SIGKILL)" onclick="killSystemProcess('${p.pid}')"><img src="assets/svg/x.svg" style="width:14px;height:14px; filter:invert(1);"></button>
            </div>
        </td>
    </tr>`).join('');
};

document.getElementById('port-search').addEventListener('input', window.renderSystemPorts);

window.fetchAllPorts = async () => {
    try {
        const res = await fetch('/api/all-ports');
        window.allSystemPorts = await res.json();
        window.renderSystemPorts();
    } catch (err) {}
};

window.killSystemProcess = async (pid) => {
    if (confirm('Force kill (SIGKILL) this process? Unsaved data may be lost.')) {
        await fetch(`/api/system/process/${pid}`, { method: 'DELETE' });
        window.fetchAllPorts();
    }
};

window.stopSystemProcess = async (pid) => {
    if (confirm('Stop (SIGTERM) this process safely?')) {
        await fetch(`/api/system/process/${pid}/stop`, { method: 'DELETE' });
        window.fetchAllPorts();
    }
};

window.promoteToFavorite = (command, exe_path, cwd) => {
    window.switchTab('favorites');
    document.getElementById('fav-name').value = command.charAt(0).toUpperCase() + command.slice(1);
    document.getElementById('fav-cmd').value = exe_path || command;
    document.getElementById('fav-dir').value = cwd || '/';
};
