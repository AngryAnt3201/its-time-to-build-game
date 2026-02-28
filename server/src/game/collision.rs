/// Client-matching terrain collision for server-side movement validation.
///
/// These functions mirror the client's world.ts terrain generation exactly
/// (hash, noise, fbm, isWater, elevation, terrainAt, isWalkable).

const TILE_PX: f32 = 16.0;

// Must match client thresholds exactly
const WATER_THRESHOLD: f64 = 0.68;
const ELEV_THRESHOLD: f64 = 0.72;

fn hash(x: i32, y: i32, seed: i32) -> u32 {
    let mut h: i32 = x.wrapping_mul(374761393)
        .wrapping_add(y.wrapping_mul(668265263))
        .wrapping_add(seed);
    h = (h ^ (h >> 13)).wrapping_mul(1274126177);
    (h ^ (h >> 16)) as u32
}

fn noise(x: f64, y: f64, scale: f64, seed: i32) -> f64 {
    let sx = x / scale;
    let sy = y / scale;
    let ix = sx.floor() as i32;
    let iy = sy.floor() as i32;
    let fx = sx - ix as f64;
    let fy = sy - iy as f64;
    let ux = fx * fx * (3.0 - 2.0 * fx);
    let uy = fy * fy * (3.0 - 2.0 * fy);
    let n00 = (hash(ix, iy, seed) & 0xffff) as f64 / 0xffff as f64;
    let n10 = (hash(ix + 1, iy, seed) & 0xffff) as f64 / 0xffff as f64;
    let n01 = (hash(ix, iy + 1, seed) & 0xffff) as f64 / 0xffff as f64;
    let n11 = (hash(ix + 1, iy + 1, seed) & 0xffff) as f64 / 0xffff as f64;
    (n00 * (1.0 - ux) + n10 * ux) * (1.0 - uy) + (n01 * (1.0 - ux) + n11 * ux) * uy
}

fn fbm(x: f64, y: f64, scale: f64, seed: i32, octaves: u32) -> f64 {
    let mut val = 0.0;
    let mut amp = 1.0;
    let mut freq = 1.0;
    let mut total = 0.0;
    for i in 0..octaves {
        val += noise(x * freq, y * freq, scale, seed + i as i32 * 1000) * amp;
        total += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    val / total
}

fn is_water(wx: i32, wy: i32) -> bool {
    fbm(wx as f64, wy as f64, 20.0, 777, 3) > WATER_THRESHOLD
}

fn elevation(wx: i32, wy: i32) -> f64 {
    fbm(wx as f64, wy as f64, 16.0, 333, 3)
}

fn is_elevated(wx: i32, wy: i32) -> bool {
    elevation(wx, wy) >= ELEV_THRESHOLD
}

/// Check if a tile coordinate is walkable (matching client terrainAt exactly).
/// Non-walkable: water, cliff_top (directly below elevated), cliff_bot (2nd row below).
pub fn is_walkable(wx: i32, wy: i32) -> bool {
    // Water
    if is_water(wx, wy) {
        return false;
    }
    // Elevated ground is walkable
    if is_elevated(wx, wy) {
        return true;
    }
    // cliff_top: tile above is elevated, this tile is not
    if is_elevated(wx, wy - 1) {
        return false;
    }
    // cliff_bot: tile 2 above is elevated, tile above is not
    if is_elevated(wx, wy - 2) && !is_elevated(wx, wy - 1) {
        return false;
    }
    true
}

/// Public wrapper around the hash function for chest validation.
/// Must match the client's `hash(wx, wy, CHEST_SEED)` exactly.
pub fn chest_hash(x: i32, y: i32, seed: i32) -> u32 {
    hash(x, y, seed)
}

/// Convert pixel position to tile coordinate.
pub fn pixel_to_tile(px: f32) -> i32 {
    (px / TILE_PX).floor() as i32
}
