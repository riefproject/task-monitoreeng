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
                const colors = {
                    '30': 'black', '31': '#ef4444', '32': '#10b981', '33': '#f59e0b', 
                    '34': '#3b82f6', '35': '#8b5cf6', '36': '#06b6d4', '37': '#f3f4f6',
                    '39': 'var(--text)',
                    '90': '#9ca3af', '91': '#f87171', '92': '#34d399', '93': '#fbbf24', 
                    '94': '#60a5fa', '95': '#a78bfa', '96': '#22d3ee', '97': '#ffffff'
                };

                const formattedLogs = logs.map(line => {
                    let html = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    
                    // Parse 256 colors
                    html = html.replace(/(?:\x1b|\u001b)\[38;5;(\d+)m/g, (match, code) => {
                        if (code === '3') return '<span style="color: #f59e0b;">'; // NestJS yellow
                        return '<span>';
                    });

                    // Parse standard ANSI codes
                    html = html.replace(/(?:\x1b|\u001b)\[(\d+(?:;\d+)*)?m/g, (match, codes) => {
                        if (!codes) return '</span>';
                        let tags = '';
                        for (let code of codes.split(';')) {
                            if (code === '0' || code === '39' || code === '49') tags += '</span>';
                            else if (colors[code]) tags += `<span style="color: ${colors[code]};">`;
                            else if (code === '1') tags += `<span style="font-weight: bold;">`;
                            else if (code === '22') tags += `</span>`;
                            else tags += `<span>`;
                        }
                        return tags;
                    });
                    
                    // Apply generic UI enhancements (Timestamp, etc)
                    html = html.replace(/^\[(\d{2}:\d{2}:\d{2})\]/, '<span style="color: #6366f1; font-weight: bold;">[$1]</span>');
                    if (!line.includes('\x1b')) {
                        // Fallback for non-ANSI lines
                        html = html.replace(/(\[ERROR\]|ERROR:|ERR!|Error:)/g, '<span style="color: #ef4444; font-weight: bold;">$1</span>');
                        html = html.replace(/(\[WARNING\]|WARNING:|WARN|Warning:)/g, '<span style="color: #f59e0b; font-weight: bold;">$1</span>');
                        html = html.replace(/(\[INFO\]|INFO:)/gi, '<span style="color: #3b82f6; font-weight: bold;">$1</span>');
                    }
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

window.copyLogs = async () => {
    try {
        const viewer = document.getElementById('log-viewer');
        await navigator.clipboard.writeText(viewer.innerText);
    } catch (e) {
        console.error('Failed to copy logs:', e);
    }
};

document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('log-modal');
    if (modal && modal.style.display === 'flex' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const activeEl = document.activeElement;
        // Allow normal select-all if they are typing in the log stdin input
        if (activeEl && activeEl.tagName === 'INPUT') return;
        
        e.preventDefault();
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('log-viewer'));
        selection.removeAllRanges();
        selection.addRange(range);
    }
});
