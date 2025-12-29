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

    if (!gridState && !geometryData) {
        heatCtx.fillStyle = '#666';
        heatCtx.font = '20px Arial';
        heatCtx.fillText('No data', 20, 40);
        return;
    }

    // 1. Draw Heatmap (Clipped)
    if (gridState && geometryData) {
        heatCtx.save();

        // Create clipping region from geometry
        drawPolygon(heatCtx, geometryData);
        heatCtx.clip();

        const rows = gridState.length;
        const cols = gridState[0].length;

        const cellWidth = heatmapCanvas.width / cols;
        const cellHeight = heatmapCanvas.height / rows;

        // Draw simple tiles (could be optimized with larger rects or ImageData)
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const val = gridState[r][c];
                // Simple heatmap coloring: Blue (cold) to Red (hot)
                const intensity = Math.min(Math.max(val / 100, 0), 1);
                const red = Math.floor(intensity * 255);
                const blue = Math.floor((1 - intensity) * 255);

                heatCtx.fillStyle = `rgb(${red}, 0, ${blue})`;
                heatCtx.fillRect(c * cellWidth, r * cellHeight, cellWidth, cellHeight);

                if (showMesh) {
                    heatCtx.strokeStyle = 'rgba(255,255,255,0.1)';
                    heatCtx.strokeRect(c * cellWidth, r * cellHeight, cellWidth, cellHeight);
                }
            }
        }
        heatCtx.restore();
    }

    // 2. Draw Polygon Overlay
    if (geometryData) {
        heatCtx.strokeStyle = '#fff';
        heatCtx.lineWidth = 2;
        drawPolygon(heatCtx, geometryData);
        heatCtx.stroke();
    }
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