from flask import Flask, render_template, request, jsonify
from simulation import HeatMapSolver
import numpy as np
import os
import json

app = Flask(__name__)

# === GLOBAL STATE ===
# We store the simulation state in memory to avoid sending 
# the entire grid back and forth over the network.
SIMULATION_STATE = {
    "grid": None,
    "solver": HeatMapSolver()
}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/geometries')
def list_geometries():
    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
    # Ensure directory exists to avoid errors
    if not os.path.exists(data_dir):
        return jsonify([])
    files = [f for f in os.listdir(data_dir) if f.endswith('.json')]
    return jsonify(files)

@app.route('/api/geometry/<filename>')
def get_geometry(filename):
    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
    file_path = os.path.join(data_dir, filename)
    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404
    with open(file_path, 'r') as f:
        return jsonify(json.load(f))

@app.route('/simulate', methods=['POST'])
def simulate():
    """
    Handles the simulation step.
    Now supports a 'Stateful' approach:
    - If 'reset' is True: Re-initializes the grid.
    - Otherwise: Continues the simulation from the last saved state in memory.
    """
    data = request.json
    geometry = data.get('geometry')
    should_reset = data.get('reset', False)
    
    # Access the global state
    current_grid = SIMULATION_STATE["grid"]
    solver = SIMULATION_STATE["solver"]
    
    # Logic to decide if we need to start from scratch
    # We reset if:
    # 1. The client explicitly requested it (e.g., loaded a new map).
    # 2. The grid hasn't been initialized yet.
    if should_reset or current_grid is None:
        # Passing None as current_grid tells the solver to create a new one
        new_grid = solver.solve_step(geometry, None)
        SIMULATION_STATE["grid"] = new_grid
    else:
        # Continue simulation using the existing grid from memory
        new_grid = solver.solve_step(geometry, current_grid)
        SIMULATION_STATE["grid"] = new_grid
    
    # Return the grid to the client for visualization
    # Note: Ideally, we would compress this or send binary data for even better performance,
    # but removing the *upload* of the grid is the biggest bottleneck fix.
    return jsonify({
        'grid': new_grid.tolist()
    })

if __name__ == '__main__':
    app.run(debug=True)