import { Assets, Container, Sprite, Texture, Rectangle } from 'pixi.js';

// ── Sprite sheet layout ─────────────────────────────────────────────────
// Each sheet is a grid of 64×64 frames.
// 4 rows = 4 directions (up-right, down-left, down-right, down-front).
// Columns = animation frames.
const FRAME_W = 64;
const FRAME_H = 64;
const DIR_ROWS = 4;

/** Logical direction indices = sprite sheet row. */
const enum Dir {
  Down = 0,      // row 0 – front / toward camera
  Left = 1,      // row 1 – facing left
  Right = 2,     // row 2 – facing right
  Up = 3,        // row 3 – back / away
}

/** Animation names that map to sprite sheets. */
export type AnimState = 'idle' | 'walk' | 'run' | 'attack' | 'hurt' | 'death';

interface AnimDef {
  path: string;
  cols: number;   // frames per row
  speed: number;  // animation speed (frames per tick, ~0.15 = 10 fps at 60 fps)
  loop: boolean;
}

const ANIM_DEFS: Record<AnimState, AnimDef> = {
  idle:   { path: 'player_sprite/PNG/Swordsman_lvl1/Without_shadow/Swordsman_lvl1_Idle_without_shadow.png',        cols: 12, speed: 0.10, loop: true  },
  walk:   { path: 'player_sprite/PNG/Swordsman_lvl1/Without_shadow/Swordsman_lvl1_Walk_without_shadow.png',        cols: 6,  speed: 0.18, loop: true  },
  run:    { path: 'player_sprite/PNG/Swordsman_lvl1/Without_shadow/Swordsman_lvl1_Run_without_shadow.png',         cols: 8,  speed: 0.20, loop: true  },
  attack: { path: 'player_sprite/PNG/Swordsman_lvl1/Without_shadow/Swordsman_lvl1_attack_without_shadow.png',      cols: 8,  speed: 0.22, loop: false },
  hurt:   { path: 'player_sprite/PNG/Swordsman_lvl1/Without_shadow/Swordsman_lvl1_Hurt_without_shadow.png',        cols: 5,  speed: 0.15, loop: false },
  death:  { path: 'player_sprite/PNG/Swordsman_lvl1/Without_shadow/Swordsman_lvl1_Death_without_shadow.png',       cols: 7,  speed: 0.12, loop: false },
};

/**
 * Animated player sprite with directional movement.
 *
 * Drop-in replacement for the old `Graphics` circle.  Exposes a `.container`
 * that should be added to the world and positioned each frame via `.x` / `.y`.
 */
export class PlayerSprite {
  readonly container = new Container();

  /** The active Sprite – swapped when animation/direction changes. */
  private sprite: Sprite;

  /** All pre-cut frame textures: animName → direction → Texture[] */
  private frames = new Map<AnimState, Texture[][]>();

  private currentAnim: AnimState = 'idle';
  private currentDir = Dir.Down;
  private frameIndex = 0;
  private frameTicker = 0;
  private animFinished = false;

  /** Scale applied to 64 px frames. */
  private static readonly SCALE = 0.80;

  constructor() {
    this.sprite = new Sprite(Texture.EMPTY);
    this.sprite.anchor.set(0.5, 0.80); // feet at position
    this.sprite.scale.set(PlayerSprite.SCALE);
    this.container.addChild(this.sprite);
  }

  // ── Position proxy ────────────────────────────────────────────────────
  get x(): number { return this.container.x; }
  set x(v: number) { this.container.x = v; }

  get y(): number { return this.container.y; }
  set y(v: number) { this.container.y = v; }

  get tint(): number { return this.sprite.tint as number; }
  set tint(v: number) { this.sprite.tint = v; }

  // ── Asset loading ─────────────────────────────────────────────────────

  /** Call once before the game loop starts. */
  async preload(): Promise<void> {
    for (const [name, def] of Object.entries(ANIM_DEFS) as [AnimState, AnimDef][]) {
      const base = await Assets.load(def.path) as Texture;
      const dirs: Texture[][] = [];

      for (let row = 0; row < DIR_ROWS; row++) {
        const rowFrames: Texture[] = [];
        for (let col = 0; col < def.cols; col++) {
          const frame = new Texture({
            source: base.source,
            frame: new Rectangle(col * FRAME_W, row * FRAME_H, FRAME_W, FRAME_H),
          });
          rowFrames.push(frame);
        }
        dirs.push(rowFrames);
      }
      this.frames.set(name, dirs);
    }

    // Start on idle-down
    this.setAnim('idle');
    this.setDirection(0, 1);
    this.applyFrame();
  }

  // ── Direction ─────────────────────────────────────────────────────────

  /**
   * Map a world-space facing vector to the best sprite row.
   *
   * Row layout (Craftpix Swordsman pack):
   *   0 = down   (front / toward camera)
   *   1 = left
   *   2 = right
   *   3 = up     (back / away)
   */
  setDirection(fx: number, fy: number): void {
    let dir: Dir;

    // Pick the dominant axis
    if (Math.abs(fy) >= Math.abs(fx)) {
      dir = fy < 0 ? Dir.Up : Dir.Down;
    } else {
      dir = fx < 0 ? Dir.Left : Dir.Right;
    }

    if (dir !== this.currentDir) {
      this.currentDir = dir;
      this.applyFrame();
    }
  }

  // ── Animation state ───────────────────────────────────────────────────

  /** Switch animation (resets frame counter if it's a new anim). */
  setAnim(anim: AnimState): void {
    if (anim === this.currentAnim && !this.animFinished) return;
    this.currentAnim = anim;
    this.frameIndex = 0;
    this.frameTicker = 0;
    this.animFinished = false;
    this.applyFrame();
  }

  /** Returns true when a non-looping animation has finished all frames. */
  get isAnimFinished(): boolean { return this.animFinished; }

  /** True when a one-shot anim (attack/hurt/death) is still playing. */
  get isPlayingOneShot(): boolean {
    const def = ANIM_DEFS[this.currentAnim];
    return !def.loop && !this.animFinished;
  }

  /** The currently active animation name. */
  get anim(): AnimState { return this.currentAnim; }

  /** Advance the animation by one game tick. Call every frame. */
  tick(): void {
    if (this.animFinished) return;

    const def = ANIM_DEFS[this.currentAnim];
    this.frameTicker += def.speed;

    if (this.frameTicker >= 1) {
      this.frameTicker -= 1;
      const dirFrames = this.frames.get(this.currentAnim)?.[this.currentDir];
      if (!dirFrames) return;

      this.frameIndex++;
      if (this.frameIndex >= dirFrames.length) {
        if (def.loop) {
          this.frameIndex = 0;
        } else {
          this.frameIndex = dirFrames.length - 1;
          this.animFinished = true;
        }
      }
      this.applyFrame();
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private applyFrame(): void {
    const dirFrames = this.frames.get(this.currentAnim)?.[this.currentDir];
    if (!dirFrames || dirFrames.length === 0) return;
    const idx = Math.min(this.frameIndex, dirFrames.length - 1);
    this.sprite.texture = dirFrames[idx];
  }
}
