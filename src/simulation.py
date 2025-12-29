import numpy as np
import cv2  # Requires: pip install opencv-python
from utils import load_config
import hashlib
import json

class HeatMapSolver:
    def __init__(self, config_path='../config.json'):
        self.config = load_config(config_path)
        self.grid_resolution = self.config['simulation_settings']['grid_resolution_meters']
        self.physics = self.config['physics_constants']
        self.heat_sources = self.config['heat_sources']

        # === 1. Caching Variables ===
        # Store the last calculated mask to avoid re-computing it every step
        self._cached_mask = None
        self._last_geometry_hash = None
        self._cached_grid_shape = None

        # === 3. Stability Check (CFL Condition) ===
        self._validate_stability()

    def _validate_stability(self):
        """
        Validates if the parameters satisfy the Heat Equation stability condition (CFL):
        dt <= dx^2 / (4 * alpha)
        """
        alpha = self.physics['thermal_diffusivity']
        dt = self.config['simulation_settings']['time_step_seconds']
        dx = self.grid_resolution
        
        limit = (dx ** 2) / (4 * alpha)
        
        if dt > limit:
            raise ValueError(
                f"Configuration Error: Simulation unstable!\n"
                f"Time step (dt={dt}) is too large for the resolution.\n"
                f"Maximum allowed dt is {limit:.6f} seconds."
            )

    def _get_geometry_hash(self, geometry):
        """Generates a unique hash for the geometry to detect changes."""
        # JSON string dump is an easy way to hash nested lists
        s = json.dumps(geometry, sort_keys=True)
        return hashlib.md5(s.encode('utf-8')).hexdigest()

    def _rasterize_geometry(self, geometry, grid_shape):
        """
        === 2. Optimization using OpenCV ===
        Uses OpenCV to rapidly draw the polygon instead of slow Python loops.
        """
        rows, cols = grid_shape
        
        # Convert coordinates from meters (Float) to pixels (Integer)
        # OpenCV expects an array of points (x, y) of type int32
        pts_float = np.array(geometry) / self.grid_resolution
        pts_int = pts_float.astype(np.int32)
        
        # Create a black image
        mask_img = np.zeros((rows, cols), dtype=np.uint8)
        
        # fillPoly fills the polygon with value 1 (white)
        # The function expects a list of polygons, so we wrap in []
        pts_reshaped = pts_int.reshape((-1, 1, 2))
        cv2.fillPoly(mask_img, [pts_reshaped], 1)
        
        # Convert to boolean mask
        return mask_img.astype(bool)

    def solve_step(self, geometry, current_grid=None):
        """
        Performs a single simulation step.
        """
        # Calculate desired grid size based on geometry
        poly = np.array(geometry)
        max_x = np.max(poly[:, 0])
        max_y = np.max(poly[:, 1])
        
        # Add small padding
        width_meters = max_x + 1.0
        height_meters = max_y + 1.0
        
        cols = int(np.ceil(width_meters / self.grid_resolution))
        rows = int(np.ceil(height_meters / self.grid_resolution))
        
        # === Check if Cache should be used ===
        geo_hash = self._get_geometry_hash(geometry)
        
        # If we have a saved mask, and geometry/size haven't changed - use it
        if (self._cached_mask is not None and 
            self._last_geometry_hash == geo_hash and 
            self._cached_grid_shape == (rows, cols)):
            mask = self._cached_mask
        else:
            # Otherwise, recalculate and save
            mask = self._rasterize_geometry(geometry, (rows, cols))
            self._cached_mask = mask
            self._last_geometry_hash = geo_hash
            self._cached_grid_shape = (rows, cols)

        # Initialize Grid (if this is the first step)
        if current_grid is None or current_grid.shape != (rows, cols):
            current_grid = np.full((rows, cols), self.physics['wall_temp'])
            current_grid[mask] = self.physics['initial_room_temp']
        
        # Apply Heat Sources
        for source in self.heat_sources:
            sx, sy = source['x'], source['y']
            sr = source['radius']
            temp = source['temperature']
            
            # Local optimization: Check only around the source (Bounding Box)
            r_start = int(max(0, (sy - sr) / self.grid_resolution))
            r_end = int(min(rows, (sy + sr) / self.grid_resolution + 1))
            c_start = int(max(0, (sx - sr) / self.grid_resolution))
            c_end = int(min(cols, (sx + sr) / self.grid_resolution + 1))
            
            # Create local coordinate grid for vector distance check
            y_indices, x_indices = np.ogrid[r_start:r_end, c_start:c_end]
            y_coords = y_indices * self.grid_resolution + self.grid_resolution/2
            x_coords = x_indices * self.grid_resolution + self.grid_resolution/2
            
            dist_sq = (x_coords - sx)**2 + (y_coords - sy)**2
            source_mask = dist_sq <= sr**2
            
            # Update only in the relevant area
            current_grid[r_start:r_end, c_start:c_end][source_mask] = temp

        # Calculate FDM Step
        alpha = self.physics['thermal_diffusivity']
        dt = self.config['simulation_settings']['time_step_seconds']
        dx = self.grid_resolution
        
        u = current_grid
        u_up = np.roll(u, -1, axis=0)
        u_down = np.roll(u, 1, axis=0)
        u_left = np.roll(u, -1, axis=1)
        u_right = np.roll(u, 1, axis=1)
        
        laplacian = (u_up + u_down + u_left + u_right - 4*u) / (dx**2)
        
        new_grid = u + alpha * dt * laplacian
        
        # Enforce Boundary Conditions: Walls at constant temperature
        new_grid[~mask] = self.physics['wall_temp']
        
        return new_grid