window.fetchWorkspaces = async () => {
    try {
        const [wsRes, favRes] = await Promise.all([
            fetch('/api/workspaces'),
            fetch('/api/favorites')
        ]);
        
        const workspaces = await wsRes.json();
        const favs = await favRes.json();
        
        // Render workspaces
        const listEl = document.getElementById('workspaces-list');
        
        // Preserve open states of details
        const openStates = {};
        listEl.querySelectorAll('details').forEach(d => {
            if (d.dataset.wsid && d.open) openStates[d.dataset.wsid] = true;
        });

        if (workspaces.length === 0) {
            listEl.innerHTML = '<div class="empty-state">No workspaces created yet.</div>';
            return;
        }
        
        let html = '';
        workspaces.forEach(ws => {
            const projectsInWs = ws.project_ids.map(id => favs.find(f => f.config.id === id)).filter(Boolean);
            const runningCount = projectsInWs.filter(p => p.status === 'running' || p.status === 'running_externally').length;
            
            html += `
            <div class="workspace-card glass" style="padding: 1rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                    <div>
                        <h4 style="margin: 0; font-size: 1.1rem; color: var(--primary);">${ws.name}</h4>
                        <small style="color: var(--text-muted);">${projectsInWs.length} Projects (${runningCount} Running)</small>
                    </div>
                    <div style="display: flex; gap: 0.5rem;">
                        <button class="btn-primary" onclick="runWorkspace('${ws.id}')" style="padding: 0.4rem 1rem; display: flex; align-items: center; gap: 4px;"><img src="assets/svg/play.svg" style="width:14px;height:14px; filter:invert(1);"> Run All</button>
                        <button class="btn-secondary" onclick="stopWorkspace('${ws.id}')" style="padding: 0.4rem 1rem; display: flex; align-items: center; gap: 4px;"><img src="assets/svg/x.svg" style="width:14px;height:14px; filter:invert(1);"> Stop All</button>
                        <button class="btn-secondary" onclick="editWorkspace('${ws.id}')" style="padding: 0.4rem 0.6rem;" title="Edit Workspace"><img src="assets/svg/edit.svg" alt="Edit" style="width: 16px; height: 16px; filter: invert(1);"></button>
                        <button class="btn-secondary" onclick="deleteWorkspace('${ws.id}')" style="padding: 0.4rem 0.6rem; color: #ff4444;" title="Delete Workspace"><img src="assets/svg/trash.svg" alt="Delete" style="width: 16px; height: 16px; filter: invert(34%) sepia(93%) saturate(6295%) hue-rotate(346deg) brightness(101%) contrast(97%);"></button>
                    </div>
                </div>
                
                <details data-wsid="${ws.id}" style="margin-top: 1rem;" ${openStates[ws.id] ? 'open' : ''}>
                    <summary style="cursor: pointer; color: var(--text-muted); outline: none;">View Projects</summary>
                    <table class="task-table" style="margin-top: 0.5rem; background: rgba(0,0,0,0.2);">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Status</th>
                                <th style="text-align: right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${projectsInWs.map(p => {
                                const st = p.status;
                                let statusHtml = '';
                                if (st === 'running' || st === 'running_externally') {
                                    statusHtml = `<span class="status-badge status-running">Running</span>`;
                                } else if (p.has_error) {
                                    statusHtml = `<span class="status-badge status-error">Error</span>`;
                                } else if (st === 'paused') {
                                    statusHtml = `<span class="status-badge status-paused">Paused</span>`;
                                } else {
                                    statusHtml = `<span class="status-badge status-stopped">Stopped</span>`;
                                }
                                
                                return `
                                <tr>
                                    <td>${p.config.name}</td>
                                    <td>${statusHtml}</td>
                                    <td class="actions-cell" style="text-align: right; display: flex; justify-content: flex-end; gap: 0.5rem; align-items: center; overflow: visible;">
                                        ${(st === 'stopped') ? `<button class="btn-primary icon-btn" title="Run" onclick="favAction('${p.config.id}', 'run'); setTimeout(window.fetchWorkspaces, 500)"><img src="assets/svg/play.svg" style="width:14px;height:14px; filter:invert(1);"></button>` : ''}
                                        ${(st === 'running' || st === 'running_externally' || st === 'paused') ? `<button class="btn-danger icon-btn" title="Stop" onclick="favAction('${p.config.id}', 'stop'); setTimeout(window.fetchWorkspaces, 500)"><img src="assets/svg/x.svg" style="width:14px;height:14px; filter:invert(1);"></button>` : ''}
                                        <button class="btn-secondary icon-btn" title="View Logs" onclick="viewLogs('${p.config.id}')"><img src="assets/svg/logs.svg" style="width:14px;height:14px; filter:invert(1);"></button>
                                        
                                        <div class="dropdown" tabindex="0">
                                            <button class="btn-secondary icon-btn"><img src="assets/svg/more-vertical.svg" style="width:14px;height:14px; filter:invert(1);"></button>
                                            <div class="dropdown-content">
                                                ${(st === 'running' || st === 'running_externally') ? `<button onclick="favAction('${p.config.id}', 'pause'); setTimeout(window.fetchWorkspaces, 500)"><img src="assets/svg/pause.svg" style="width:14px;height:14px; filter:invert(1);"> Pause</button>` : ''}
                                                ${(st === 'paused') ? `<button onclick="favAction('${p.config.id}', 'resume'); setTimeout(window.fetchWorkspaces, 500)"><img src="assets/svg/play.svg" style="width:14px;height:14px; filter:invert(1);"> Resume</button>` : ''}
                                                <button onclick="editFavorite('${p.config.id}')"><img src="assets/svg/edit.svg" style="width:14px;height:14px; filter:invert(1);"> Edit</button>
                                                <button class="danger" onclick="delFav('${p.config.id}'); setTimeout(window.fetchWorkspaces, 500)"><img src="assets/svg/trash.svg" style="width:14px;height:14px; filter:invert(1);"> Delete</button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </details>
            </div>
            `;
        });
        
        listEl.innerHTML = html;
        
    } catch (err) {}
};

window.openWorkspaceModal = () => {
    document.getElementById('popup-ws-name').value = '';
    document.getElementById('workspace-popup-form').dataset.editId = '';
    const container = document.getElementById('ws-services-container');
    container.innerHTML = '';
    window.addWorkspaceServiceRow(); // Add one initial empty row
    document.getElementById('workspace-modal').style.display = 'flex';
};

window.editWorkspace = async (wsId) => {
    try {
        const [wsRes, favRes] = await Promise.all([
            fetch('/api/workspaces'),
            fetch('/api/favorites')
        ]);
        const workspaces = await wsRes.json();
        const favs = await favRes.json();
        
        const ws = workspaces.find(w => w.id === wsId);
        if (!ws) return;
        
        document.getElementById('popup-ws-name').value = ws.name;
        document.getElementById('workspace-popup-form').dataset.editId = wsId;
        
        const container = document.getElementById('ws-services-container');
        container.innerHTML = '';
        
        ws.project_ids.forEach(id => {
            const f = favs.find(f => f.config.id === id);
            if (!f) return;
            const row = document.createElement('div');
            row.className = 'ws-service-row';
            row.dataset.projectId = f.config.id;
            row.innerHTML = `
                <div class="input-group" style="flex: 1; margin-bottom: 0;">
                    <label>Name</label>
                    <input type="text" class="ws-svc-name" value="${f.config.name}" required>
                </div>
                <div class="input-group" style="flex: 1.5; margin-bottom: 0;">
                    <label>Command</label>
                    <input type="text" class="ws-svc-cmd" value="${f.config.command.replace(/"/g, '&quot;')}" required>
                </div>
                <div class="input-group" style="flex: 1; margin-bottom: 0;">
                    <label>Port</label>
                    <input type="text" class="ws-svc-port" value="${f.config.port || ''}">
                </div>
                <div class="input-group" style="flex: 1.5; margin-bottom: 0;">
                    <label>Directory</label>
                    <div style="display: flex; gap: 0.5rem; height: 42px;">
                        <input type="text" class="ws-svc-cwd" value="${f.config.cwd.replace(/"/g, '&quot;')}" required style="flex: 1; height: 100%;">
                        <button type="button" class="btn-secondary" onclick="browseFolderDynamic(this)" style="display: flex; align-items: center; justify-content: center; padding: 0 1rem; height: 100%;"><img src="assets/svg/folder.svg" style="width:16px;height:16px; filter:invert(1);"></button>
                    </div>
                </div>
                <div style="display: flex; gap: 0.25rem; height: 42px; flex-shrink: 0;">
                    <button type="button" class="btn-secondary" onclick="moveRowUp(this)" style="padding: 0 0.5rem;" title="Move Up">↑</button>
                    <button type="button" class="btn-secondary" onclick="moveRowDown(this)" style="padding: 0 0.5rem;" title="Move Down">↓</button>
                    <button type="button" class="btn-secondary" onclick="this.closest('.ws-service-row').remove()" style="padding: 0 0.5rem;" title="Remove Service"><img src="assets/svg/trash.svg" alt="Delete" style="width: 16px; height: 16px; filter: invert(34%) sepia(93%) saturate(6295%) hue-rotate(346deg) brightness(101%) contrast(97%);"></button>
                </div>
            `;
            container.appendChild(row);
        });
        
        document.getElementById('workspace-modal').style.display = 'flex';
    } catch (err) {}
};

window.addWorkspaceServiceRow = () => {
    const container = document.getElementById('ws-services-container');
    const row = document.createElement('div');
    row.className = 'ws-service-row';
    
    row.innerHTML = `
        <div class="input-group" style="flex: 1; margin-bottom: 0;">
            <label>Name</label>
            <input type="text" class="ws-svc-name" placeholder="e.g. Cache" required>
        </div>
        <div class="input-group" style="flex: 1.5; margin-bottom: 0;">
            <label>Command</label>
            <input type="text" class="ws-svc-cmd" placeholder="e.g. redis-server" required>
        </div>
        <div class="input-group" style="flex: 1; margin-bottom: 0;">
            <label>Port</label>
            <input type="text" class="ws-svc-port" placeholder="e.g. 6379">
        </div>
        <div class="input-group" style="flex: 1.5; margin-bottom: 0;">
            <label>Directory</label>
            <div style="display: flex; gap: 0.5rem; height: 42px;">
                <input type="text" class="ws-svc-cwd" placeholder="e.g. /" required style="flex: 1; height: 100%;">
                <button type="button" class="btn-secondary" onclick="browseFolderDynamic(this)" style="display: flex; align-items: center; justify-content: center; padding: 0 1rem; height: 100%;"><img src="assets/svg/folder.svg" style="width:16px;height:16px; filter:invert(1);"></button>
            </div>
        </div>
        <div style="display: flex; gap: 0.25rem; height: 42px; flex-shrink: 0;">
            <button type="button" class="btn-secondary" onclick="moveRowUp(this)" style="padding: 0 0.5rem;" title="Move Up">↑</button>
            <button type="button" class="btn-secondary" onclick="moveRowDown(this)" style="padding: 0 0.5rem;" title="Move Down">↓</button>
            <button type="button" class="btn-secondary" onclick="this.closest('.ws-service-row').remove()" style="padding: 0 0.5rem;" title="Remove Service"><img src="assets/svg/trash.svg" alt="Delete" style="width: 16px; height: 16px; filter: invert(34%) sepia(93%) saturate(6295%) hue-rotate(346deg) brightness(101%) contrast(97%);"></button>
        </div>
    `;
    
    container.appendChild(row);
};

window.browseFolderDynamic = async (btn) => {
    try {
        const res = await fetch('/api/dialog/folder');
        if (res.ok) {
            const path = await res.text();
            if (path) {
                // The input field is the previous sibling of the button inside the flex div
                const input = btn.previousElementSibling;
                if (input && input.classList.contains('ws-svc-cwd')) {
                    input.value = path;
                }
            }
        }
    } catch (err) {}
};

window.moveRowUp = (btn) => {
    const row = btn.closest('.ws-service-row');
    if (row.previousElementSibling) {
        row.parentNode.insertBefore(row, row.previousElementSibling);
    }
};

window.moveRowDown = (btn) => {
    const row = btn.closest('.ws-service-row');
    if (row.nextElementSibling) {
        row.parentNode.insertBefore(row.nextElementSibling, row);
    }
};

window.saveWorkspace = async (e) => {
    e.preventDefault();
    const wsName = document.getElementById('popup-ws-name').value;
    const rows = document.querySelectorAll('.ws-service-row');
    
    if (rows.length === 0) return alert('Add at least one service!');
    
    // Fetch existing favorites
    const favRes = await fetch('/api/favorites');
    const favs = await favRes.json();
    
    const project_ids = [];
    
    for (const row of rows) {
        const name = row.querySelector('.ws-svc-name').value;
        const command = row.querySelector('.ws-svc-cmd').value;
        const port = row.querySelector('.ws-svc-port').value || null;
        const cwd = row.querySelector('.ws-svc-cwd').value;
        const projectId = row.dataset.projectId;
        
        if (projectId) {
            // Update existing favorite project
            await fetch('/api/favorites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: projectId, name, command, cwd, port, auto_restart: true })
            });
            project_ids.push(projectId);
        } else {
            // Find identical service (by port, command, and cwd)
            const existing = favs.find(f => f.config.command === command && f.config.cwd === cwd && f.config.port === port);
            
            if (existing) {
                project_ids.push(existing.config.id);
            } else {
                // Create new favorite project
                const createRes = await fetch('/api/favorites', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: '', name, command, cwd, port, auto_restart: true })
                });
                const newFav = await createRes.json();
                project_ids.push(newFav.id);
            }
        }
    }
    
    const editId = document.getElementById('workspace-popup-form').dataset.editId || '';
    
    // Create or update the workspace
    await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, name: wsName, project_ids })
    });
    
    document.getElementById('workspace-modal').style.display = 'none';
    window.fetchWorkspaces();
    window.fetchFavorites();
};

window.deleteWorkspace = async (id) => {
    if (!confirm('Delete this workspace?')) return;
    await fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
    window.fetchWorkspaces();
};

window.runWorkspace = async (wsId) => {
    try {
        const [wsRes, favRes] = await Promise.all([
            fetch('/api/workspaces'),
            fetch('/api/favorites')
        ]);
        
        const workspaces = await wsRes.json();
        const favs = await favRes.json();
        const ws = workspaces.find(w => w.id === wsId);
        if (!ws) return;
        
        const projectsInWs = ws.project_ids.map(id => favs.find(f => f.config.id === id)).filter(Boolean);
        const stopped = projectsInWs.filter(f => f.status === 'stopped');
        
        let skipped = [];
        
        for (const f of stopped) {
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
            
            await new Promise(r => setTimeout(r, 1500));
            if (window.fetchAllPorts) await window.fetchAllPorts();
        }
        
        window.fetchWorkspaces();
        window.fetchFavorites();
        
        if (skipped.length > 0) {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(`⚠️ Workspace Skipped Projects`, { body: `Skipped: ${skipped.join(', ')}\n(Port already in use or service active)` });
            }
            alert(`Workspace Run skipped the following projects because their ports are already active:\n- ${skipped.join('\n- ')}`);
        }
    } catch (err) {}
};

window.stopWorkspace = async (wsId) => {
    try {
        const [wsRes, favRes] = await Promise.all([
            fetch('/api/workspaces'),
            fetch('/api/favorites')
        ]);
        
        const workspaces = await wsRes.json();
        const favs = await favRes.json();
        const ws = workspaces.find(w => w.id === wsId);
        if (!ws) return;
        
        const projectsInWs = ws.project_ids.map(id => favs.find(f => f.config.id === id)).filter(Boolean);
        const running = projectsInWs.filter(f => f.status === 'running');
        
        for (const f of running) {
            await fetch(`/api/favorites/${f.config.id}/action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'stop', command_override: null })
            });
        }
        
        window.fetchWorkspaces();
        window.fetchFavorites();
    } catch (err) {}
};

// Auto refresh
setInterval(() => {
    const el = document.getElementById('tab-workspaces');
    if (el && el.style.display !== 'none') {
        if (document.activeElement && document.activeElement.closest('.dropdown')) return;
        window.fetchWorkspaces();
    }
}, 2000);
