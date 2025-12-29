# 2D Heat Map Simulator 🔥

A real-time, physics-based 2D heat diffusion simulator with a stateful backend and a "Pro" visual frontend.

![Heat Map Simulator](https://via.placeholder.com/800x400?text=Heat+Map+Simulator+Screenshot)

## Features

*   **Physics Engine:**
    *   **Finite Difference Method (FDM)** for solving the Heat Equation.
    *   **Neumann Boundary Conditions:** Walls are insulated (reflect heat).
    *   **Convection:** Simulates buoyancy (heat rises).
    *   **Stability Checks:** Automatic CFL condition validation.
*   **Performance:**
    *   **OpenCV Rasterization:** High-speed polygon processing.
    *   **Stateful Backend:** Grid state is maintained on the server to minimize bandwidth.
    *   **Optimized Rendering:** Client-side bilinear smoothing via off-screen canvas.
*   **Visuals & UI:**
    *   **Pro Dark Mode:** Sleek, modern interface.
    *   **HSL Rainbow Palette:** Scientific-grade thermal visualization.
    *   **Interactive Controls:** Load geometries, toggle mesh, and scrub through history.
    *   **Time Travel:** History buffer with a playback slider to replay the simulation.

## Project Structure

```
heat_map_structure/
├── config.json           # Physics & Simulation parameters
├── requirements.txt      # Python dependencies
├── data/                 # Geometry files (JSON)
│   ├── rectangle_room.json
│   └── two_bedroom_apartment.json
└── src/                  # Source code
    ├── app.py            # Flask Backend
    ├── simulation.py     # Physics Engine
    ├── utils.py          # Utilities
    └── static/ & templates/ # Frontend Assets
```

## Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/itay-yelin/heat_map_structure_simulation.git
    cd heat_map_structure
    ```

2.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

## How to Run

1.  **Start the Server:**
    ```bash
    cd src
    python app.py
    ```

2.  **Open the Application:**
    Navigate to [http://127.0.0.1:5000](http://127.0.0.1:5000) in your web browser.

3.  **Usage:**
    *   Select a room layout from the dropdown (e.g., `two_bedroom_apartment.json`).
    *   Click **Run Simulation**.
    *   Use the **Time Slider** to pause and scrub through the simulation history.

## customization

You can modify `config.json` to tweak physical constants like:
*   `thermal_diffusivity` (Alpha)
*   `wall_temp`
*   `heat_sources` (Positions and temperatures)

## License

MIT
