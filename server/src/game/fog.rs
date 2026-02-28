use std::collections::HashSet;

use super::tilemap::{CHUNK_SIZE, TILE_SIZE};

/// Fog of war tracking system.
///
/// Tracks which tiles have been revealed by light sources and which tiles
/// are currently lit. Revealed tiles remain visible (dimmed) even after
/// the light source moves away.
pub struct FogOfWar {
    /// Set of chunk coordinates (cx, cy) that have been revealed at some point.
    pub revealed: HashSet<(i32, i32)>,
    /// Set of currently lit tiles, stored as (cx, cy, tx, ty).
    pub lit_tiles: HashSet<(i32, i32, usize, usize)>,
}

impl FogOfWar {
    pub fn new() -> Self {
        FogOfWar {
            revealed: HashSet::new(),
            lit_tiles: HashSet::new(),
        }
    }

    /// Update lit tiles based on current light sources.
    ///
    /// Each light source is `(world_x, world_y, radius)` in world (pixel) coordinates.
    /// Returns a list of chunk positions that were newly revealed this update.
    pub fn update_light(&mut self, light_sources: &[(f32, f32, f32)]) -> Vec<(i32, i32)> {
        // Clear previously lit tiles — only currently active lights matter
        self.lit_tiles.clear();

        let mut newly_revealed = Vec::new();

        for &(lx, ly, radius) in light_sources {
            // Determine the bounding box in tile coordinates
            let min_world_x = lx - radius;
            let min_world_y = ly - radius;
            let max_world_x = lx + radius;
            let max_world_y = ly + radius;

            // Convert bounding box corners to tile indices (absolute tile coords)
            let tile_min_x = (min_world_x / TILE_SIZE).floor() as i32;
            let tile_min_y = (min_world_y / TILE_SIZE).floor() as i32;
            let tile_max_x = (max_world_x / TILE_SIZE).floor() as i32;
            let tile_max_y = (max_world_y / TILE_SIZE).floor() as i32;

            for abs_ty in tile_min_y..=tile_max_y {
                for abs_tx in tile_min_x..=tile_max_x {
                    // Center of this tile in world coordinates
                    let tile_center_x = (abs_tx as f32 + 0.5) * TILE_SIZE;
                    let tile_center_y = (abs_ty as f32 + 0.5) * TILE_SIZE;

                    let dx = tile_center_x - lx;
                    let dy = tile_center_y - ly;
                    let dist = (dx * dx + dy * dy).sqrt();

                    if dist <= radius {
                        // Convert absolute tile coords to chunk + local tile coords
                        let cx = abs_tx.div_euclid(CHUNK_SIZE as i32);
                        let cy = abs_ty.div_euclid(CHUNK_SIZE as i32);
                        let tx = abs_tx.rem_euclid(CHUNK_SIZE as i32) as usize;
                        let ty = abs_ty.rem_euclid(CHUNK_SIZE as i32) as usize;

                        self.lit_tiles.insert((cx, cy, tx, ty));

                        // Track newly revealed chunks
                        if self.revealed.insert((cx, cy)) {
                            newly_revealed.push((cx, cy));
                        }
                    }
                }
            }
        }

        newly_revealed
    }

    /// Check if a specific tile is currently lit.
    pub fn is_lit(&self, cx: i32, cy: i32, tx: usize, ty: usize) -> bool {
        self.lit_tiles.contains(&(cx, cy, tx, ty))
    }
}

impl Default for FogOfWar {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_fog() {
        let fog = FogOfWar::new();
        assert!(!fog.is_lit(0, 0, 0, 0));
        assert!(fog.revealed.is_empty());
    }

    #[test]
    fn light_source_illuminates_tiles() {
        let mut fog = FogOfWar::new();
        // Place a light at world position (8, 8) with radius 20
        let newly = fog.update_light(&[(8.0, 8.0, 20.0)]);

        // Should have lit some tiles
        assert!(!fog.lit_tiles.is_empty());
        // The tile at world (8, 8) should be lit — that's chunk (0,0), tile (0,0)
        assert!(fog.is_lit(0, 0, 0, 0));
        // Should have revealed chunk (0, 0)
        assert!(newly.contains(&(0, 0)));
    }

    #[test]
    fn clearing_lights_removes_lit_tiles() {
        let mut fog = FogOfWar::new();
        fog.update_light(&[(8.0, 8.0, 20.0)]);
        assert!(!fog.lit_tiles.is_empty());

        // Update with no light sources
        fog.update_light(&[]);
        assert!(fog.lit_tiles.is_empty());

        // But revealed chunks remain
        assert!(!fog.revealed.is_empty());
    }

    #[test]
    fn newly_revealed_only_on_first_visit() {
        let mut fog = FogOfWar::new();
        let newly1 = fog.update_light(&[(8.0, 8.0, 20.0)]);
        assert!(!newly1.is_empty());

        // Same position again — no newly revealed chunks
        let newly2 = fog.update_light(&[(8.0, 8.0, 20.0)]);
        assert!(newly2.is_empty());
    }
}
