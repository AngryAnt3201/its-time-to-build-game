use std::collections::HashMap;

use noise::{NoiseFn, Simplex};

pub const CHUNK_SIZE: usize = 32;
pub const TILE_SIZE: f32 = 16.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Terrain {
    Grass,
    Stone,
    Water,
    Dirt,
}

pub struct Chunk {
    pub cx: i32,
    pub cy: i32,
    pub tiles: [[Terrain; CHUNK_SIZE]; CHUNK_SIZE],
    pub generated: bool,
}

impl Chunk {
    /// Generate terrain for a chunk using simplex noise.
    ///
    /// Noise value thresholds:
    /// - < -0.3 => Water
    /// - < 0.0  => Dirt
    /// - > 0.5  => Stone
    /// - else   => Grass
    pub fn generate(cx: i32, cy: i32, seed: u32) -> Self {
        let noise_fn = Simplex::new(seed);
        let mut tiles = [[Terrain::Grass; CHUNK_SIZE]; CHUNK_SIZE];

        let scale = 0.05; // Controls terrain feature size

        for ty in 0..CHUNK_SIZE {
            for tx in 0..CHUNK_SIZE {
                // Convert tile position to world coordinates for noise sampling
                let world_x = (cx as f64 * CHUNK_SIZE as f64 + tx as f64) * scale;
                let world_y = (cy as f64 * CHUNK_SIZE as f64 + ty as f64) * scale;

                let value = noise_fn.get([world_x, world_y]);

                tiles[ty][tx] = if value < -0.3 {
                    Terrain::Water
                } else if value < 0.0 {
                    Terrain::Dirt
                } else if value > 0.5 {
                    Terrain::Stone
                } else {
                    Terrain::Grass
                };
            }
        }

        Chunk {
            cx,
            cy,
            tiles,
            generated: true,
        }
    }
}

pub struct TileMap {
    pub chunks: HashMap<(i32, i32), Chunk>,
    pub seed: u32,
}

impl TileMap {
    pub fn new(seed: u32) -> Self {
        TileMap {
            chunks: HashMap::new(),
            seed,
        }
    }

    /// Lazily generate and return a reference to the chunk at (cx, cy).
    pub fn get_or_generate(&mut self, cx: i32, cy: i32) -> &Chunk {
        self.chunks
            .entry((cx, cy))
            .or_insert_with(|| Chunk::generate(cx, cy, self.seed))
    }

    /// Convert world coordinates (pixels) to chunk coordinates.
    pub fn world_to_chunk(world_x: f32, world_y: f32) -> (i32, i32) {
        let chunk_world_size = CHUNK_SIZE as f32 * TILE_SIZE;
        let cx = (world_x / chunk_world_size).floor() as i32;
        let cy = (world_y / chunk_world_size).floor() as i32;
        (cx, cy)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chunk_generation_is_deterministic() {
        let chunk_a = Chunk::generate(0, 0, 42);
        let chunk_b = Chunk::generate(0, 0, 42);
        for y in 0..CHUNK_SIZE {
            for x in 0..CHUNK_SIZE {
                assert_eq!(chunk_a.tiles[y][x], chunk_b.tiles[y][x]);
            }
        }
    }

    #[test]
    fn world_to_chunk_positive() {
        let (cx, cy) = TileMap::world_to_chunk(100.0, 200.0);
        // chunk_world_size = 32 * 16 = 512
        assert_eq!(cx, 0);
        assert_eq!(cy, 0);
    }

    #[test]
    fn world_to_chunk_negative() {
        let (cx, cy) = TileMap::world_to_chunk(-1.0, -1.0);
        assert_eq!(cx, -1);
        assert_eq!(cy, -1);
    }

    #[test]
    fn lazy_generation() {
        let mut map = TileMap::new(42);
        assert!(map.chunks.is_empty());
        let _ = map.get_or_generate(0, 0);
        assert_eq!(map.chunks.len(), 1);
        // Calling again should not create a new chunk
        let _ = map.get_or_generate(0, 0);
        assert_eq!(map.chunks.len(), 1);
    }
}
