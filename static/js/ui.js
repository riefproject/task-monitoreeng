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
window.switchTab = (tabId) => {
    document.querySelectorAll('.content').forEach(el => el.style.display = 'none');
    document.getElementById(`tab-${tabId}`).style.display = 'flex';
    
    document.querySelectorAll('.sidebar nav a').forEach(el => el.classList.remove('active'));
    event.target.classList.add('active');
};

// Clipboard copying
window.copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
};

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
