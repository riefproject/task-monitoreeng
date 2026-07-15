let currentLogId = null;
let currentLogInterval = null;

window.viewLogs = async (id) => {
    currentLogId = id;
    
    const fav = await fetch('/api/favorites').then(res => res.json());
    const project = fav.find(f => f.config.id === id);
    if (project) document.getElementById('log-title').innerText = `Logs: ${project.config.name}`;
    window.fetchFavorites();

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
                    html = html.replace(/^\[(\d{2}:\d{2}:\d{2})\]/, '<span style="color: #6366f1; font-weight: bold;">[$1]</span>');
                    html = html.replace(/(\[ERROR\]|ERROR:|ERR!|Error:)/g, '<span style="color: #ef4444; font-weight: bold;">$1</span>');
                    html = html.replace(/(\[WARNING\]|WARNING:|WARN|Warning:)/g, '<span style="color: #f59e0b; font-weight: bold;">$1</span>');
                    html = html.replace(/(\[INFO\]|INFO:)/gi, '<span style="color: #3b82f6; font-weight: bold;">$1</span>');
                    html = html.replace(/(Ready to accept connections|Server initialized|Running mode=standalone|starting|success)/gi, '<span style="color: #10b981; font-weight: bold;">$1</span>');
                    html = html.replace(/(port=\d+)/g, '<span style="color: #8b5cf6; font-weight: 500;">$1</span>');
                    html = html.replace(/(pid=\d+)/g, '<span style="color: #06b6d4; font-weight: 500;">$1</span>');
                    return html;
                });
                viewer.innerHTML = formattedLogs.join('<br>');
            } else {
                viewer.innerHTML = '<span style="color: var(--text-muted);">No logs available yet...</span>';
            }
            if (isScrolledToBottom) viewer.scrollTop = viewer.scrollHeight;
        } catch (e) {}
    };
    
    fetchLogs();
    currentLogInterval = setInterval(fetchLogs, 1000);
    
    // Focus the input box automatically
    setTimeout(() => document.getElementById('log-input').focus(), 100);
};

window.sendStdin = async (e) => {
    e.preventDefault();
    if (!currentLogId) return;
    const inputEl = document.getElementById('log-input');
    const input = inputEl.value;
    if (!input) return;
    
    inputEl.value = '';
    
    // Optimistically show user input in logs
    const viewer = document.getElementById('log-viewer');
    viewer.innerHTML += `<br><span style="color: var(--primary); font-weight: bold;">&gt; ${input.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</span>`;
    viewer.scrollTop = viewer.scrollHeight;

    await fetch(`/api/favorites/${currentLogId}/input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input })
    });
};

window.closeLogs = () => {
    document.getElementById('log-modal').style.display = 'none';
    if (currentLogInterval) clearInterval(currentLogInterval);
};
