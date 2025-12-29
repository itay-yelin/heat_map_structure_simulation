const geometryCanvas = document.getElementById('geometryCanvas');
const heatmapCanvas = document.getElementById('heatmapCanvas');
const geoCtx = geometryCanvas.getContext('2d');
const heatCtx = heatmapCanvas.getContext('2d');

// === UI Elements ===
const timeSlider = document.getElementById('timeSlider');
const frameCounter = document.getElementById('frameCounter');
const playPauseBtn = document.getElementById('playPauseBtn');
const geometrySelect = document.getElementById('geometrySelect');

// === State ===
let geometryData = null;
let isSimulating = false;
let isPlaying = false;
let showMesh = false;
let animationId = null;

let history = [];
let currentFrameIndex = -1;

const GRID_RES = 0.1; // Must match server config

// === Debug Helper ===
function log(msg) {
    console.log(msg);
    // Optional: could render to a div if needed
}

// === Auto-Zoom Logic ===
function getTransform(ctx, points) {
    if (!points || points.length === 0) return { scale: 1, offsetX: 0, offsetY: 0 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[1] > maxY) maxY = p[1];
    });

    const geomWidth = maxX - minX;
    const geomHeight = maxY - minY;

    // Use available size (with padding)
    const padding = 40;
    const availWidth = ctx.canvas.width - padding * 2;
    const availHeight = ctx.canvas.height - padding * 2;

    if (availWidth <= 0 || availHeight <= 0) return { scale: 1, offsetX: 0, offsetY: 0 };

    // Determine scale to fit
    // Avoid divide by zero
    const scaleX = geomWidth > 0 ? availWidth / geomWidth : 1;
    const scaleY = geomHeight > 0 ? availHeight / geomHeight : 1;
    const scale = Math.min(scaleX, scaleY);

    // Center it
    // offsetX maps World(0) to Screen(X)
    // We want World(minX) to map to Padding + (centering offset)
    // ScreenX = (WorldX * scale) + offsetX
    // offsetX = ScreenX - (WorldX * scale)

    // We want the bounding box centered:
    // BoxScreenCenter = Padding + Avail/2
    // BoxWorldCenter = minX + geomWidth/2
    // ScreenCenter = (WorldCenter * scale) + offsetX
    // offsetX = ScreenCenter - (WorldCenter * scale)

    const screenCenterX = padding + availWidth / 2;
    const screenCenterY = padding + availHeight / 2;

    const worldCenterX = minX + geomWidth / 2;
    const worldCenterY = minY + geomHeight / 2;

    const offsetX = screenCenterX - (worldCenterX * scale);
    const offsetY = screenCenterY - (worldCenterY * scale);

    return { scale, offsetX, offsetY };
}

// === Resize ===
function resizeCanvas() {
    if (geometryCanvas.parentElement) {
        geometryCanvas.width = geometryCanvas.parentElement.clientWidth - 20;
        geometryCanvas.height = geometryCanvas.parentElement.clientHeight - 60; // Extra space for headers
    }
    if (heatmapCanvas.parentElement) {
        // Find the wrapper or container
        const wrapper = heatmapCanvas.parentElement;
        heatmapCanvas.width = wrapper.clientWidth; // Wrapper handles layout
        heatmapCanvas.height = wrapper.clientHeight;
    }
    render();
}
window.addEventListener('resize', resizeCanvas);

// === Geometry Loading ===
async function loadGeometryList() {
    try {
        const response = await fetch('/api/geometries');
        const files = await response.json();
        geometrySelect.innerHTML = '<option value="">Select Geometry...</option>';
        files.forEach(file => {
            const option = document.createElement('option');
            option.value = file;
            option.textContent = file;
            geometrySelect.appendChild(option);
        });
        log("Geometry list loaded.");
    } catch (err) {
        log("Failed to load geometry list: " + err);
        alert("Error loading geometry list. Is server running?");
    }
}

geometrySelect.addEventListener('change', async (e) => {
    const filename = e.target.value;
    if (!filename) return;

    try {
        log("Loading geometry: " + filename);
        const response = await fetch(`/api/geometry/${filename}`);
        if (!response.ok) throw new Error("Status " + response.status);

        geometryData = await response.json();
        log("Geometry loaded. Points: " + geometryData.length);

        // Reset History
        history = [];
        currentFrameIndex = -1;
        updateSliderUI();

        // Render Immediately
        render();
    } catch (err) {
        log("Error loading geometry: " + err);
        alert("Failed to load geometry file.");
    }
});

// === Controls ===
document.getElementById('toggleMesh').addEventListener('change', (e) => {
    showMesh = e.target.checked;
    render();
});

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
    isPlaying = false;
    playPauseBtn.textContent = "▶";
    currentFrameIndex = parseInt(e.target.value);
    render();
    updateLabel();
});

function updateSliderUI() {
    const max = Math.max(0, history.length - 1);
    timeSlider.max = max;

    // Clamp index
    if (currentFrameIndex > max) currentFrameIndex = max;
    if (currentFrameIndex < 0 && max > 0) currentFrameIndex = 0;

    timeSlider.value = currentFrameIndex;
    updateLabel();
}

function updateLabel() {
    const current = Math.max(0, currentFrameIndex);
    const total = Math.max(0, history.length - 1);
    frameCounter.textContent = `${current} / ${total}`;
}

// === Simulation Loop ===
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
            console.error(err);
            isSimulating = false; // Stop on error
        }
    } else if (isPlaying && !atLiveEdge) {
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

// === Rendering ===
function render() {
    renderGeometry();
    renderHeatmap();
}

function renderGeometry() {
    geoCtx.clearRect(0, 0, geometryCanvas.width, geometryCanvas.height);

    if (!geometryData) {
        geoCtx.fillStyle = '#666';
        geoCtx.font = '16px monospace';
        geoCtx.fillText('No geometry loaded', 20, 30);
        return;
    }

    const transform = getTransform(geoCtx, geometryData);

    geoCtx.strokeStyle = '#0f0';
    geoCtx.lineWidth = 2;
    drawPolygon(geoCtx, geometryData, transform);
    geoCtx.stroke();

    // Debug info
    geoCtx.fillStyle = '#0f0';
    geoCtx.font = '12px monospace';
    // geoCtx.fillText(`Scale: ${transform.scale.toFixed(2)}`, 10, 20);
}

function renderHeatmap() {
    heatCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);

    if (!geometryData) {
        heatCtx.fillStyle = '#666';
        // Debug: Fill background to prove canvas exists
        heatCtx.fillStyle = '#111';
        heatCtx.fillRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);

        if (geometryData) {
            // Use the same transform as the geometry view
            const transform = getTransform(heatCtx, geometryData);

            // Debug: Show scale info
            heatCtx.fillStyle = '#888';
            heatCtx.font = '12px monospace';
            heatCtx.fillText(`Geo: ${geometryData.length} pts`, 10, 20);
            heatCtx.fillText(`Scale: ${transform.scale.toFixed(1)}`, 10, 35);
            heatCtx.fillText(`Offset: ${transform.offsetX.toFixed(0)},${transform.offsetY.toFixed(0)}`, 10, 50);

            // Draw Heatmap Content
            const gridState = history[currentFrameIndex];
            if (gridState) {
                heatCtx.fillText(`Grid: ${gridState.length}x${gridState[0].length}`, 10, 65);

                const rows = gridState.length;
                const cols = gridState[0].length;
                const GRID_RES = 0.1;

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

                // DEBUG: CLIPPING DISABLED TEMPORARILY
                // drawPolygon(heatCtx, geometryData, transform);
                // heatCtx.clip();

                heatCtx.imageSmoothingEnabled = true;
                heatCtx.imageSmoothingQuality = 'high';

                const destX = transform.offsetX;
                const destY = transform.offsetY;
                const destW = cols * GRID_RES * transform.scale;
                const destH = rows * GRID_RES * transform.scale;

                // Debug: Draw rect where image should be
                heatCtx.strokeStyle = 'yellow';
                heatCtx.strokeRect(destX, destY, destW, destH);

                heatCtx.drawImage(offCanvas, destX, destY, destW, destH);

                heatCtx.restore();
            } else {
                heatCtx.fillStyle = '#f00';
                heatCtx.fillText("No Grid State (Click Run)", 10, 80);
            }

            // Draw Boundary on top
            heatCtx.strokeStyle = '#ffffff';
            heatCtx.lineWidth = 2;
            drawPolygon(heatCtx, geometryData, transform);
            heatCtx.stroke();
        } else {
            heatCtx.fillStyle = 'red';
            heatCtx.font = '20px Arial';
            heatCtx.fillText('NO GEOMETRY LOADED', 20, 40);
        }
        // Mesh Overlay
        if (showMesh && history.length > 0) {
            // Optional: Draw mesh lines if desired, using similar logic
        }
    }

    function drawPolygon(ctx, points, { scale, offsetX, offsetY }) {
        ctx.beginPath();
        points.forEach((p, i) => {
            const x = p[0] * scale + offsetX;
            const y = p[1] * scale + offsetY;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
    }

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

    // Init
    resizeCanvas(); // Ensure size is correct before load
    loadGeometryList();