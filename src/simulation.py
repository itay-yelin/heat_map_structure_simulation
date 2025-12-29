import numpy as np
from utils import load_config

class HeatMapSolver:
    def __init__(self, config_path='../config.json'):
        self.config = load_config(config_path)
        self.grid_resolution = self.config['simulation_settings']['grid_resolution_meters']
        self.physics = self.config['physics_constants']
        self.heat_sources = self.config['heat_sources']

    def _rasterize_geometry(self, geometry, grid_shape):
        """
        Creates a boolean mask where True indicates inside the room.
        Uses a simple ray-casting algorithm for point-in-polygon.
        
        Args:
            geometry (list): Polygon vertices [[x,y], ...].
            grid_shape (tuple): (rows, cols) of the grid.
            
        Returns:
            numpy.ndarray: Boolean mask (True=Inside, False=Wall/Outside).
        """
        rows, cols = grid_shape
        mask = np.zeros(grid_shape, dtype=bool)
        
        # Pre-compute edges
        poly = np.array(geometry)
        edges = []
        for i in range(len(poly)):
            p1 = poly[i]
            p2 = poly[(i + 1) % len(poly)]
            edges.append((p1, p2))
            
        dx = self.grid_resolution
        
        # Check center of each cell
        for r in range(rows):
            y = r * dx + dx/2
            for c in range(cols):
                x = c * dx + dx/2
                
                # Ray casting to the right
                intersections = 0
                for p1, p2 in edges:
                    # Check if ray intersects edge
                    # Ray: (x, y) -> (infinity, y)
                    # Edge: p1 -> p2
                    
                    x1, y1 = p1
                    x2, y2 = p2
                    
                    # Check if edge spans the y-coordinate of the point
                    if (y1 > y) != (y2 > y):
                        # Compute x-coordinate of intersection
                        x_intersect = (x2 - x1) * (y - y1) / (y2 - y1) + x1
                        if x < x_intersect:
                            intersections += 1
                            
                if intersections % 2 == 1:
                    mask[r, c] = True
                    
        return mask

    def solve_step(self, geometry, current_grid=None):
        """
        Performs a single simulation step using Finite Difference Method.
        """
        # 1. Determine Grid Dimensions
        # Find bounding box of geometry to size the grid dynamically
        poly = np.array(geometry)
        max_x = np.max(poly[:, 0])
        max_y = np.max(poly[:, 1])
        
        # Add some padding
        width_meters = max_x + 1.0
        height_meters = max_y + 1.0
        
        cols = int(np.ceil(width_meters / self.grid_resolution))
        rows = int(np.ceil(height_meters / self.grid_resolution))
        
        # 2. Initialize Grid if Needed
        if current_grid is None or current_grid.shape != (rows, cols):
            # Create new grid
            current_grid = np.full((rows, cols), self.physics['wall_temp'])
            
            # Create mask for interior
            mask = self._rasterize_geometry(geometry, (rows, cols))
            
            # Set initial room temp for interior points
            current_grid[mask] = self.physics['initial_room_temp']
        else:
            mask = self._rasterize_geometry(geometry, current_grid.shape)
            
        # 3. Apply Heat Sources
        for source in self.heat_sources:
            # Map source (x, y) to grid indices
            sx, sy = source['x'], source['y']
            sr = source['radius']
            temp = source['temperature']
            
            # Simple circular source
            # Iterate over bounding box of source to avoid full grid scan
            r_start = int(max(0, (sy - sr) / self.grid_resolution))
            r_end = int(min(rows, (sy + sr) / self.grid_resolution + 1))
            c_start = int(max(0, (sx - sr) / self.grid_resolution))
            c_end = int(min(cols, (sx + sr) / self.grid_resolution + 1))
            
            for r in range(r_start, r_end):
                y = r * self.grid_resolution + self.grid_resolution/2
                for c in range(c_start, c_end):
                    x = c * self.grid_resolution + self.grid_resolution/2
                    if (x - sx)**2 + (y - sy)**2 <= sr**2:
                        current_grid[r, c] = temp

        # 4. FDM Step
        # u_new = u + alpha * dt * laplacian(u)
        # Laplacian (2D central difference): (u[i+1,j] + u[i-1,j] + u[i,j+1] + u[i,j-1] - 4u[i,j]) / dx^2
        
        alpha = self.physics['thermal_diffusivity']
        dt = self.config['simulation_settings']['time_step_seconds']
        dx = self.grid_resolution
        
        # Vectorized Laplacian using numpy.roll
        u = current_grid
        u_up = np.roll(u, -1, axis=0)
        u_down = np.roll(u, 1, axis=0)
        u_left = np.roll(u, -1, axis=1)
        u_right = np.roll(u, 1, axis=1)
        
        laplacian = (u_up + u_down + u_left + u_right - 4*u) / (dx**2)
        
        # Update grid
        new_grid = u + alpha * dt * laplacian
        
        # 5. Apply Boundary Conditions
        # Reset walls (outside mask) to wall_temp
        new_grid[~mask] = self.physics['wall_temp']
        
        # Fix boundary values caused by np.roll wrapping around
        # (Though mask reset handles most, good to be explicit about edges if boundaries were open)
        # Here, since we have a "room" inside a grid of "wall", the mask reset is sufficient.
        
        return new_grid
