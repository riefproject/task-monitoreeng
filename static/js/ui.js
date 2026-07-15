// Favicon updating logic
let currentFaviconHasError = null;
window.updateFavicon = (hasError) => {
    if (currentFaviconHasError === hasError) return;
    currentFaviconHasError = hasError;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1e1e1e';
    ctx.beginPath();
    ctx.roundRect(0, 0, 32, 32, 8);
    ctx.fill();

    ctx.fillStyle = '#8b5cf6';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PM', 16, 17);

    if (hasError) {
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
};
window.updateFavicon(false);

// Tab switching
window.switchTab = (e, tabId) => {
    e.preventDefault();
    document.querySelectorAll('.content').forEach(el => el.style.display = 'none');
    document.getElementById(`tab-${tabId}`).style.display = 'flex';
    
    document.querySelectorAll('.sidebar nav a').forEach(el => el.classList.remove('active'));
    e.currentTarget.classList.add('active');
    
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.add('collapsed');
        const overlay = document.getElementById('sidebar-overlay');
        if (overlay) overlay.classList.remove('active');
    }
    
    if (tabId === 'workspaces' && window.fetchWorkspaces) {
        window.fetchWorkspaces();
    }
};

// Clipboard copying
window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
};

// Sidebar Toggle
window.toggleSidebar = () => {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('collapsed');
    
    if (window.innerWidth <= 768) {
        if (sidebar.classList.contains('collapsed')) {
            overlay.classList.remove('active');
        } else {
            overlay.classList.add('active');
        }
    }
};

// Initialize Sidebar for mobile
if (window.innerWidth <= 768) {
    document.querySelector('.sidebar').classList.add('collapsed');
    if (document.getElementById('sidebar-overlay')) {
        document.getElementById('sidebar-overlay').classList.remove('active');
    }
}
window.addEventListener('resize', () => {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (window.innerWidth <= 768) {
        if (!sidebar.classList.contains('collapsed')) {
            // If we resized to mobile and it wasn't collapsed, it should probably collapse or show overlay
            sidebar.classList.add('collapsed');
            if (overlay) overlay.classList.remove('active');
        }
    } else {
        // Desktop
        sidebar.classList.remove('collapsed');
        if (overlay) overlay.classList.remove('active');
    }
});

// Request Notification Permission
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// Table column resizers
window.initResizers = () => {
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

setTimeout(window.initResizers, 500);
