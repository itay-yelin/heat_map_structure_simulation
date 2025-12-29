from flask import Flask, render_template, request, jsonify
from simulation import HeatMapSolver
import numpy as np
import os
import json

app = Flask(__name__)
solver = HeatMapSolver()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/geometries')
def list_geometries():
    data_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
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
    data = request.json
    geometry = data.get('geometry')
    # grid_state comes in as a list of lists if it exists
    current_grid_list = data.get('grid_state')
    
    current_grid = None
    if current_grid_list:
        current_grid = np.array(current_grid_list)
        
    updated_grid = solver.solve_step(geometry, current_grid)
    
    return jsonify({
        'grid': updated_grid.tolist()
    })

if __name__ == '__main__':
    app.run(debug=True)
