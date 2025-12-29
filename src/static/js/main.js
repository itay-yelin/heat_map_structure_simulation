const geometryCanvas = document.getElementById('geometryCanvas');
const heatmapCanvas = document.getElementById('heatmapCanvas');
const geoCtx = geometryCanvas.getContext('2d');
const heatCtx = heatmapCanvas.getContext('2d');

// === UI Elements ===
const timeSlider = document.getElementById('timeSlider');
const frameCounter = document.getElementById('frameCounter');
const playPauseBtn = document.getElementById('playPauseBtn');

// === State ===
let geometryData = null;
let isSimulating = false;
let isPlaying = false;
let showMesh = false;
let animationId = null;

// === History Buffer ===
let history = [];
let currentFrameIndex = -1;

// Resize canvases
function resizeCanvas() {
    if (geometryCanvas.parentElement) {
        geometryCanvas.width = geometryCanvas.parentElement.clientWidth - 20;
        geometryCanvas.height = geometryCanvas.parentElement.clientHeight - 40;
    }
    if (heatmapCanvas.parentElement) {
        heatmapCanvas.width = heatmapCanvas.parentElement.clientWidth - 20;
        heatmapCanvas.height = heatmapCanvas.parentElement.clientHeight - 40;
    }
    render();
}
window.addEventListener('resize', resizeCanvas);

// Dropdown Handler
const geometrySelect = document.getElementById('geometrySelect');
async function loadGeometryList() {
    try {
        const response = await fetch('/api/geometries');
        const files = await response.json();
        files.forEach(file => {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = file;
            geometrySelect.appendChild(option);
        });
    } catch (err) { console.error(err); }
}

geometrySelect.addEventListener('change', async (e) => {
    const filename = e.target.value;
    if (!filename) return;
    try {
        const response = await fetch(`/api/geometry/${filename}`);
        geometryData = await response.json();

        // RESET EVERYTHING on new load
        history = [];
        currentFrameIndex = -1;
        updateSliderUI();

        render();
    } catch (err) { console.error(err); }
});

document.getElementById('toggleMesh').addEventListener('change', (e) => {
    showMesh = e.target.checked;
    render();
});

// === TIMELINE & PLAYBACK CONTROLS ===

document.getElementById('runBtn').addEventListener('click', () => {
    isSimulating = !isSimulating;
    const btn = document.getElementById('runBtn');

    if (isSimulating) {
        btn.textContent = "Stop Calculation";
        btn.style.backgroundColor = "#af4c4c";
        isPlaying = true;
        simulationLoop();
    } else {
        btn.textContent = "Resume Calculation";
        btn.style.backgroundColor = "";
        isPlaying = false;
    }
});

playPauseBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playPauseBtn.textContent = isPlaying ? "⏸" : "▶";
    if (isPlaying) simulationLoop();
});

timeSlider.addEventListener('input', (e) => {
    isPlaying = false; // Pause when scrubbing
    playPauseBtn.textContent = "▶";

    currentFrameIndex = parseInt(e.target.value);
    render();
    updateLabel();
});

function updateSliderUI() {
    const max = Math.max(0, history.length - 1);
    timeSlider.max = max;
    timeSlider.value = Math.max(0, currentFrameIndex);
    updateLabel();
}

function updateLabel() {
    const current = Math.max(0, currentFrameIndex);
    const total = Math.max(0, history.length - 1);
    frameCounter.textContent = `${current} / ${total}`;
}

// === MAIN LOOP ===
async function simulationLoop() {
    if (!isPlaying && !isSimulating) return;

    const atLiveEdge = (currentFrameIndex === history.length - 1) || (history.length === 0);

    if (isSimulating && atLiveEdge) {
        if (!geometryData) return;
        const shouldReset = (history.length === 0);

        try {
            const response = await fetch('/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geometry: geometryData, reset: shouldReset })
            });
            const data = await response.json();

            history.push(data.grid);
            currentFrameIndex = history.length - 1;
            updateSliderUI();
        } catch (err) {
            console.error("Sim Error", err);
            isSimulating = false;
        }
    }
    else if (isPlaying && !atLiveEdge) {
        if (currentFrameIndex < history.length - 1) {
            currentFrameIndex++;
            updateSliderUI();
        } else {
            if (!isSimulating) {
                isPlaying = false;
                playPauseBtn.textContent = "▶";
            }
        }
    }

    render();

    if (isPlaying || isSimulating) {
        animationId = requestAnimationFrame(simulationLoop);
    }
}

// === RENDERING & ALIGNMENT FIX ===

function getTransform(ctx, points) {
    if (!points || points.length === 0) return { scale: 1, offsetX: 0, offsetY: 0, maxX: 0, maxY: 0 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
    });

    const geomWidth = maxX - minX;
    const geomHeight = maxY - minY;

    // Avoid division by zero
    if (geomWidth === 0 || geomHeight === 0) return { scale: 1, offsetX: 0, offsetY: 0, maxX, maxY };

    const padding = 40;
    const availWidth = ctx.canvas.width - padding * 2;
    const availHeight = ctx.canvas.height - padding * 2;

    const scaleX = availWidth / geomWidth;
    const scaleY = availHeight / geomHeight;
    const scale = Math.min(scaleX, scaleY);

    const offsetX = padding - (minX * scale) + (availWidth - geomWidth * scale) / 2;
    const offsetY = padding - (minY * scale) + (availHeight - geomHeight * scale) / 2;

    return { scale, offsetX, offsetY, maxX, maxY };
}

function render() {
    renderGeometry();
    renderHeatmap();
}

function renderGeometry() {
    geoCtx.clearRect(0, 0, geometryCanvas.width, geometryCanvas.height);
    if (!geometryData) {
        geoCtx.fillStyle = '#666'; geoCtx.font = '20px Arial';
        geoCtx.fillText('No geometry loaded', 20, 40);
        return;
    }

    geoCtx.strokeStyle = '#0f0';
    geoCtx.lineWidth = 2;

    const transform = getTransform(geoCtx, geometryData);
    drawPolygon(geoCtx, geometryData, transform);
    geoCtx.stroke();
}

function renderHeatmap() {
    heatCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);

    if (geometryData) {
        const transform = getTransform(heatCtx, geometryData);

        // 1. Draw Heatmap Content
        const gridState = history[currentFrameIndex];
        if (gridState) {
            const rows = gridState.length;
            const cols = gridState[0].length;

            const offCanvas = document.createElement('canvas');
            offCanvas.width = cols; offCanvas.height = rows;
            const offCtx = offCanvas.getContext('2d');
            const imgData = offCtx.createImageData(cols, rows);
            const data = imgData.data;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const val = gridState[r][c];
                    const t = Math.min(Math.max(val / 100, 0), 1);
                    const [rVal, gVal, bVal] = getHeatColorRGB(t);
                    const index = (r * cols + c) * 4;
                    data[index] = rVal; data[index + 1] = gVal; data[index + 2] = bVal; data[index + 3] = 255;
                }
            }

            offCtx.putImageData(imgData, 0, 0);

            heatCtx.save();
            drawPolygon(heatCtx, geometryData, transform);
            heatCtx.clip();

            heatCtx.imageSmoothingEnabled = true;
            heatCtx.imageSmoothingQuality = 'high';

            // === ALIGNMENT FIX START ===
            // We must map the Grid (World 0,0 to World Width,Height) 
            // to the Screen using the SAME transform as the geometry.

            // Estimate resolution based on Geometry MaxX vs Grid Cols
            // Python: cols = (maxX + 1.0) / res  =>  res = (maxX + 1.0) / cols
            // We use maxX from transform calculation to match alignment.
            const estimatedRes = (transform.maxX + 1.0) / cols;

            const gridWorldWidth = cols * estimatedRes;
            const gridWorldHeight = rows * estimatedRes;

            // Map World (0,0) to Screen (DestX, DestY)
            const destX = (0 * transform.scale) + transform.offsetX;
            const destY = (0 * transform.scale) + transform.offsetY;
            const destW = gridWorldWidth * transform.scale;
            const destH = gridWorldHeight * transform.scale;

            heatCtx.drawImage(offCanvas, destX, destY, destW, destH);
            // === ALIGNMENT FIX END ===

            heatCtx.restore();
        }

        // 2. Draw Boundary on top
        heatCtx.strokeStyle = '#ffffff';
        heatCtx.lineWidth = 2;
        drawPolygon(heatCtx, geometryData, transform);
        heatCtx.stroke();
    }
}

function drawPolygon(ctx, points, { scale, offsetX, offsetY }) {
    ctx.beginPath();
    points.forEach((p, i) => {
        const x = p[0] * scale + offsetX;
        const y = p[1] * scale + offsetY;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
}

// HSL Rainbow Color
function getHeatColorRGB(t) {
    const hue = (1.0 - t) * 240;
    return hslToRgb(hue / 360, 1.0, 0.5);
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1; if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

loadGeometryList();
resizeCanvas();