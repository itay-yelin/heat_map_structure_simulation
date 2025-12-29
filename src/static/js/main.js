const geometryCanvas = document.getElementById('geometryCanvas');
const heatmapCanvas = document.getElementById('heatmapCanvas');
const geoCtx = geometryCanvas.getContext('2d');
const heatCtx = heatmapCanvas.getContext('2d');

let geometryData = null;
let gridState = null;
let isSimulating = false;
let showMesh = false;
let animationId = null;

// Resize canvases to fit container
function resizeCanvas() {
    geometryCanvas.width = geometryCanvas.parentElement.clientWidth - 20;
    geometryCanvas.height = geometryCanvas.parentElement.clientHeight - 40;
    heatmapCanvas.width = heatmapCanvas.parentElement.clientWidth - 20;
    heatmapCanvas.height = heatmapCanvas.parentElement.clientHeight - 40;
    renderGeometry();
    renderHeatmap();
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
    } catch (err) {
        console.error("Failed to load geometry list:", err);
    }
}

geometrySelect.addEventListener('change', async (e) => {
    const filename = e.target.value;
    if (!filename) return;

    try {
        const response = await fetch(`/api/geometry/${filename}`);
        geometryData = await response.json();

        // Reset grid state when new geometry is loaded
        // This will trigger a 'reset' flag in the next simulation loop
        gridState = null;

        renderGeometry();
        renderHeatmap();
    } catch (err) {
        console.error("Failed to load geometry:", err);
    }
});

// Toggle Mesh
document.getElementById('toggleMesh').addEventListener('change', (e) => {
    showMesh = e.target.checked;
    renderHeatmap();
});

// Run Simulation
document.getElementById('runBtn').addEventListener('click', () => {
    isSimulating = !isSimulating;
    const btn = document.getElementById('runBtn');

    if (isSimulating) {
        btn.textContent = "Stop Simulation";
        btn.style.backgroundColor = "#af4c4c";
        simulationLoop();
    } else {
        btn.textContent = "Run Simulation";
        btn.style.backgroundColor = ""; // Reset to default (managed by CSS)
        cancelAnimationFrame(animationId);
    }
});

function renderGeometry() {
    geoCtx.clearRect(0, 0, geometryCanvas.width, geometryCanvas.height);

    if (!geometryData) {
        geoCtx.fillStyle = '#666';
        geoCtx.font = '20px Arial';
        geoCtx.fillText('No geometry loaded', 20, 40);
        return;
    }

    geoCtx.strokeStyle = '#0f0';
    geoCtx.lineWidth = 2;

    drawPolygon(geoCtx, geometryData);
    geoCtx.stroke();
}

function drawPolygon(ctx, points) {
    // Basic scaling to fit canvas - ASSUMING simple polygons for now
    const scale = 50;
    const offsetX = 50;
    const offsetY = 50;

    ctx.beginPath();
    if (Array.isArray(points)) {
        points.forEach((point, index) => {
            const x = point[0] * scale + offsetX;
            const y = point[1] * scale + offsetY;
            if (index === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
    }
}

function renderHeatmap() {
    heatCtx.clearRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);

    if (!gridState || !geometryData) {
        if (!gridState && !geometryData) {
            heatCtx.fillStyle = '#666';
            heatCtx.font = '20px Arial';
            heatCtx.fillText('No data', 20, 40);
        }
        return;
    }

    const rows = gridState.length;
    const cols = gridState[0].length;

    // 1. Create a tiny off-screen canvas (Size = Grid Dimensions)
    const offCanvas = document.createElement('canvas');
    offCanvas.width = cols;
    offCanvas.height = rows;
    const offCtx = offCanvas.getContext('2d');

    // 2. Create an ImageData object to manipulate pixels directly
    const imgData = offCtx.createImageData(cols, rows);
    const data = imgData.data;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const val = gridState[r][c];
            // Normalize 0..1 (Assuming max temp is roughly 100 for now)
            const t = Math.min(Math.max(val / 100, 0), 1);

            // Get color from improved palette
            const [rVal, gVal, bVal] = getHeatColorRGB(t);

            // Calculate 1D index for the pixel
            const index = (r * cols + c) * 4;
            data[index] = rVal;     // Red
            data[index + 1] = gVal; // Green
            data[index + 2] = bVal; // Blue
            data[index + 3] = 255;  // Alpha (Opacity)
        }
    }

    // 3. Put data into the tiny canvas
    offCtx.putImageData(imgData, 0, 0);

    // 4. Draw the tiny canvas onto the main canvas (STRETCHED)
    // Save context to apply clipping
    heatCtx.save();

    // Create clipping mask from geometry
    drawPolygon(heatCtx, geometryData);
    heatCtx.clip();

    // Enable smoothing for the nice gradient effect
    heatCtx.imageSmoothingEnabled = true;
    heatCtx.imageSmoothingQuality = 'high';

    // Draw!
    heatCtx.drawImage(offCanvas, 0, 0, heatmapCanvas.width, heatmapCanvas.height);

    heatCtx.restore();

    // 5. Draw overlay boundary
    heatCtx.strokeStyle = '#ffffff';
    heatCtx.lineWidth = 2;
    drawPolygon(heatCtx, geometryData);
    heatCtx.stroke();
}

function getHeatColorRGB(t) {
    // t is 0.0 (Cold) to 1.0 (Hot)

    // Map t to Hue: 
    // 0.0 -> 240 deg (Blue)
    // 0.5 -> 120 deg (Green)
    // 1.0 -> 0 deg (Red)
    const hue = (1.0 - t) * 240;

    // Convert HSL to RGB (Standard formula or use a canvas trick)
    // Simple HSL to RGB conversion for Saturation=100%, Lightness=50%
    return hslToRgb(hue / 360, 1.0, 0.5);
}

// Helper to convert HSL to [r,g,b]
function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

async function simulationLoop() {
    if (!isSimulating) return;

    if (!geometryData) {
        alert("Please load geometry first!");
        isSimulating = false;
        document.getElementById('runBtn').click(); // toggle back
        return;
    }

    // === OPTIMIZATION FIX ===
    // Determine if we need to tell the server to reset the simulation state.
    // This happens if we don't have a grid yet (first run or new geometry loaded).
    const shouldReset = (gridState === null);

    try {
        const response = await fetch('/simulate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // We NO LONGER send 'grid_state' here. 
            // We only send the geometry and the reset flag.
            body: JSON.stringify({
                geometry: geometryData,
                reset: shouldReset
            })
        });

        const data = await response.json();

        // Update local grid with the new state from server
        gridState = data.grid;

        renderHeatmap();

        animationId = requestAnimationFrame(simulationLoop);
    } catch (err) {
        console.error("Simulation error:", err);
        isSimulating = false;
    }
}

// Initial call
loadGeometryList();
resizeCanvas();