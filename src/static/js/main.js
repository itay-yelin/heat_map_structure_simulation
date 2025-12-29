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
let isSimulating = false; // Is the server calculating new frames?
let isPlaying = false;    // Is the UI playing the animation (live or replay)?
let showMesh = false;
let animationId = null;

// === History Buffer ===
let history = []; // Stores all grid states: [grid1, grid2, ...]
let currentFrameIndex = -1;

// Resize canvases
function resizeCanvas() {
    const parent = geometryCanvas.parentElement;
    geometryCanvas.width = parent.clientWidth - 20;
    geometryCanvas.height = parent.clientHeight - 40;
    heatmapCanvas.width = parent.clientWidth - 20;
    heatmapCanvas.height = parent.clientHeight - 40;
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

// 1. Run / Stop Simulation (Server Communication)
document.getElementById('runBtn').addEventListener('click', () => {
    isSimulating = !isSimulating;
    const btn = document.getElementById('runBtn');

    if (isSimulating) {
        btn.textContent = "Stop Calculation";
        btn.style.backgroundColor = "#af4c4c";
        isPlaying = true; // Auto-play when starting
        simulationLoop();
    } else {
        btn.textContent = "Resume Calculation";
        btn.style.backgroundColor = "";
        // We don't stop the loop here, we just stop Fetching new data.
        // The loop continues to handle UI/Replay.
    }
});

// 2. Play / Pause Animation (Client Side)
playPauseBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playPauseBtn.textContent = isPlaying ? "⏸" : "▶";
    if (isPlaying) simulationLoop(); // Restart loop if it was dead
});

// 3. Slider Interaction (Scrubbing)
timeSlider.addEventListener('input', (e) => {
    // If user moves slider, we pause auto-playback
    isPlaying = false;
    playPauseBtn.textContent = "▶";

    // Jump to specific frame
    currentFrameIndex = parseInt(e.target.value);
    render();
    updateLabel();
});

function updateSliderUI() {
    timeSlider.max = Math.max(0, history.length - 1);
    timeSlider.value = currentFrameIndex;
    updateLabel();
}

function updateLabel() {
    frameCounter.textContent = `${currentFrameIndex} / ${history.length - 1}`;
}

// === MAIN LOOP ===
async function simulationLoop() {
    if (!isPlaying && !isSimulating) return; // Stop entirely if everything is paused

    // A. LIVE MODE: Fetch new data from server
    // We only fetch if we are at the END of the history AND 'isSimulating' is true
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

            // Add to history
            history.push(data.grid);
            currentFrameIndex = history.length - 1;

            updateSliderUI();
        } catch (err) {
            console.error("Sim Error", err);
            isSimulating = false;
        }
    }
    // B. REPLAY MODE: Just advance frame index
    else if (isPlaying && !atLiveEdge) {
        if (currentFrameIndex < history.length - 1) {
            currentFrameIndex++;
            updateSliderUI();
        } else {
            // We hit the end of recorded history
            if (isSimulating) {
                // Determine to seamlessly switch back to fetching?
                // For now, let's just stay here.
            } else {
                isPlaying = false; // Stop at end
                playPauseBtn.textContent = "▶";
            }
        }
    }

    render();

    if (isPlaying || isSimulating) {
        // Use a slight delay if replay is too fast, or raw requestAnimationFrame
        animationId = requestAnimationFrame(simulationLoop);
    }
}

// === RENDERING ===
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
    geoCtx.strokeStyle = '#0f0'; geoCtx.lineWidth = 2;
    drawPolygon(geoCtx, geometryData);
    geoCtx.stroke();
}

function renderHeatmap() {
    heatCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);

    // Get the specific grid from history based on slider
    const gridState = history[currentFrameIndex];

    if (!gridState || !geometryData) return;

    // Use the optimized Canvas scaling method
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
    drawPolygon(heatCtx, geometryData);
    heatCtx.clip();
    heatCtx.imageSmoothingEnabled = true;
    heatCtx.imageSmoothingQuality = 'high';
    heatCtx.drawImage(offCanvas, 0, 0, heatmapCanvas.width, heatmapCanvas.height);
    heatCtx.restore();

    if (showMesh) { /* Mesh drawing logic optional here */ }
}

function drawPolygon(ctx, points) {
    const scale = 50; const offsetX = 50; const offsetY = 50;
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