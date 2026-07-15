window.fetchFavorites = async () => {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT' && activeEl.id.startsWith('cmd-in-')) return;

    try {
        const res = await fetch('/api/favorites');
        const favs = await res.json();
        
        window.updateFavicon(favs.some(f => f.has_error));

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
                        <button class="btn-secondary" onclick="delFav('${f.config.id}')" title="Remove" style="display: flex; align-items: center; justify-content: center; padding: 0.5rem;"><i data-feather="trash-2" style="width: 14px; height: 14px;"></i></button>
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
    window.fetchFavorites();
});

window.favAction = async (id, action, command_override = null) => {
    await fetch(`/api/favorites/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, command_override })
    });
    window.fetchFavorites();
    if (action === 'run') setTimeout(window.fetchAllPorts, 800);
};

window.delFav = async (id) => {
    if(confirm('Delete project?')) {
        await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
        window.fetchFavorites();
    }
};

window.browseFolder = async (inputId) => {
    try {
        const res = await fetch('/api/dialog/folder');
        if (res.ok) document.getElementById(inputId).value = await res.text();
    } catch (err) {}
};
