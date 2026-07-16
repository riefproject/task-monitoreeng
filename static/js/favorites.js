let knownErrors = new Set();

window.fetchFavorites = async () => {
    const activeEl = document.activeElement;
    if (activeEl && activeEl.tagName === 'INPUT' && activeEl.id.startsWith('cmd-in-')) return;

    try {
        const res = await fetch('/api/favorites');
        const favs = await res.json();
        
        window.updateFavicon(favs.some(f => f.has_error));
        
        // Handle Notifications
        const currentErrors = new Set(favs.filter(f => f.has_error).map(f => f.config.id));
        for (const id of currentErrors) {
            if (!knownErrors.has(id)) {
                const proj = favs.find(f => f.config.id === id);
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification(`⚠️ PortMon: Error Detected`, { body: `Project "${proj.config.name}" emitted an error! Check the logs.` });
                }
            }
        }
        knownErrors = currentErrors;

        const listEl = document.getElementById('fav-list');
        if (favs.length === 0) return listEl.innerHTML = '<tr><td colspan="5" class="empty-state">No favorite projects yet.</td></tr>';
            
        listEl.innerHTML = favs.map(f => {
            const st = f.status;

            let statusBadge = st === 'running' ? '<span class="status-badge running">Running</span>' : 
                              st === 'paused' ? '<span class="status-badge">Paused</span>' : 
                              st === 'running_externally' ? '<span class="status-badge running" style="background:var(--warning);color:black;">External</span>' :
                              '<span class="status-badge stopped">Stopped</span>';

            return `<tr>
                <td><strong>${f.config.name}</strong></td>
                <td><input type="text" id="cmd-in-${f.config.id}" value="${f.config.command.replace(/"/g, '&quot;')}" style="background:transparent; border:1px solid rgba(255,255,255,0.1); color:var(--text); font-family:'Fira Code', monospace; font-size:0.8rem; padding:0.25rem 0.5rem; width:100%; min-width:200px; border-radius:4px; outline:none;" onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'" onchange="favAction('${f.config.id}', 'update', this.value)"></td>
                <td><span class="code-font" style="color:var(--primary); font-weight:bold;">${f.config.port || '-'}</span></td>
                <td><span class="code-font" style="font-size:0.7rem;">${f.config.cwd}</span></td>
                <td>${statusBadge}</td>
                <td>
                    <div class="actions-group" style="display: flex; gap: 0.5rem; align-items: center; justify-content: flex-end; overflow: visible;">
                        ${(st === 'stopped') ? `<button class="btn-primary icon-btn" title="Run" onclick="favAction('${f.config.id}', 'run', document.getElementById('cmd-in-${f.config.id}').value)"><img src="assets/svg/play.svg" style="width:14px;height:14px; filter:invert(1);"></button>` : ''}
                        ${(st === 'running' || st === 'running_externally' || st === 'paused') ? `<button class="btn-danger icon-btn" title="Stop" onclick="favAction('${f.config.id}', 'stop')"><img src="assets/svg/x.svg" style="width:14px;height:14px; filter:invert(1);"></button>` : ''}
                        
                        ${(st !== 'running_externally') ? `<button class="btn-secondary icon-btn" onclick="viewLogs('${f.config.id}')" title="View Logs" style="position: relative;"><img src="assets/svg/logs.svg" style="width:14px;height:14px; filter:invert(1);">${f.has_error ? '<span style="position:absolute; top:-2px; right:-2px; width:8px; height:8px; background:var(--danger); border-radius:50%; box-shadow:0 0 4px var(--danger);"></span>' : ''}</button>` : ''}
                        
                        <div class="dropdown" tabindex="0">
                            <button class="btn-secondary icon-btn"><img src="assets/svg/more-vertical.svg" style="width:14px;height:14px; filter:invert(1);"></button>
                            <div class="dropdown-content">
                                ${(st === 'running' || st === 'running_externally') ? `<button onclick="favAction('${f.config.id}', 'pause')"><img src="assets/svg/pause.svg" style="width:14px;height:14px; filter:invert(1);"> Pause</button>` : ''}
                                ${(st === 'paused') ? `<button onclick="favAction('${f.config.id}', 'resume')"><img src="assets/svg/play.svg" style="width:14px;height:14px; filter:invert(1);"> Resume</button>` : ''}
                                ${(st === 'running_externally') ? `<button onclick="killSystemProcess('${f.ext_pid}')"><img src="assets/svg/x.svg" style="width:14px;height:14px; filter:invert(1);"> Force Kill Orphan</button>` : ''}
                                <button onclick="editFavorite('${f.config.id}')"><img src="assets/svg/edit.svg" style="width:14px;height:14px; filter:invert(1);"> Edit</button>
                                <button class="danger" onclick="delFav('${f.config.id}')"><img src="assets/svg/trash.svg" style="width:14px;height:14px; filter:invert(1);"> Delete</button>
                            </div>
                        </div>
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
    const port = document.getElementById('fav-port').value;
    const auto_restart = document.getElementById('fav-autorestart').checked;
    const editId = e.target.dataset.editId || '';
    await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, name, command, cwd, port: port || null, auto_restart })
    });
    e.target.dataset.editId = '';
    const btn = document.querySelector('#fav-form button[type="submit"]');
    if (btn) btn.innerHTML = '<img src="assets/svg/add.svg" style="width:14px;height:14px; filter:invert(1);"> Add Project';
    document.getElementById('fav-name').value = '';
    document.getElementById('fav-cmd').value = '';
    document.getElementById('fav-dir').value = '';
    document.getElementById('fav-port').value = '';
    document.getElementById('fav-autorestart').checked = false;
    window.fetchFavorites();
});

window.favAction = async (id, action, command_override = null) => {
    try {
        const res = await fetch(`/api/favorites/${id}/action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, command_override })
        });
        if (!res.ok) {
            const errText = await res.text();
            alert(`Error: ${errText}`);
        }
    } catch(err) {
        alert("Action failed: " + err);
    }
    window.fetchFavorites();
    if (action === 'run') setTimeout(window.fetchAllPorts, 800);
};

window.delFav = async (id) => {
    if(confirm('Delete project?')) {
        await fetch(`/api/favorites/${id}`, { method: 'DELETE' });
        window.fetchFavorites();
    }
};

window.editFavorite = async (id) => {
    try {
        const res = await fetch('/api/favorites');
        const favs = await res.json();
        const proj = favs.find(f => f.config.id === id);
        if (!proj) return;
        
        document.getElementById('popup-fav-name').value = proj.config.name;
        document.getElementById('popup-fav-cmd').value = proj.config.command;
        document.getElementById('popup-fav-dir').value = proj.config.cwd;
        document.getElementById('popup-fav-port').value = proj.config.port || '';
        document.getElementById('popup-fav-autorestart').checked = proj.config.auto_restart;
        
        const form = document.getElementById('favorite-popup-form');
        form.dataset.editId = id;
        
        document.getElementById('favorite-modal').style.display = 'flex';
    } catch (err) {}
};

document.getElementById('favorite-popup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('popup-fav-name').value;
    const command = document.getElementById('popup-fav-cmd').value;
    const cwd = document.getElementById('popup-fav-dir').value;
    const port = document.getElementById('popup-fav-port').value;
    const auto_restart = document.getElementById('popup-fav-autorestart').checked;
    const editId = e.target.dataset.editId;
    
    if (!editId) return;
    
    await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, name, command, cwd, port: port || null, auto_restart })
    });
    
    document.getElementById('favorite-modal').style.display = 'none';
    window.fetchFavorites();
    if (window.fetchWorkspaces) window.fetchWorkspaces();
});

window.browseFolder = async (inputId) => {
    try {
        const res = await fetch('/api/dialog/folder');
        if (res.ok) document.getElementById(inputId).value = await res.text();
    } catch (err) {}
};

window.runAllFavorites = async () => {
    try {
        const res = await fetch('/api/favorites');
        const favs = await res.json();
        const stopped = favs.filter(f => f.status === 'stopped');
        
        let skipped = [];
        
        for (const f of stopped) {
            // Port collision prevention
            if (f.config.port) {
                const isTaken = window.allSystemPorts && window.allSystemPorts.some(p => p.port === f.config.port);
                if (isTaken) {
                    skipped.push(f.config.name);
                    continue; 
                }
            }
            
            await fetch(`/api/favorites/${f.config.id}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'run', command_override: null })
            });
            
            // Wait 1.5s between starting services to avoid race conditions
            await new Promise(r => setTimeout(r, 1500));
            // Refresh ports so the next project knows what's taken
            await window.fetchAllPorts();
        }
        
        window.fetchFavorites();
        
        if (skipped.length > 0) {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(`⚠️ Batch Run Skipped Projects`, { body: `Skipped: ${skipped.join(', ')}\n(Port already in use or service active)` });
            }
            alert(`Batch Run skipped the following projects because their ports are already active:\n- ${skipped.join('\n- ')}`);
        }
    } catch (err) {}
};
