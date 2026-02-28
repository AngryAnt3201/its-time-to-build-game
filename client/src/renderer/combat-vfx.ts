import { Assets, Container, Graphics, Sprite, Text, Texture, TextStyle } from 'pixi.js';

const FONT = '"IBM Plex Mono", monospace';

interface DamageNumber {
  text: Text;
  life: number;
  vy: number;
}

interface DeathParticle {
  gfx: Graphics;
  vx: number;
  vy: number;
  life: number;
}

interface SwingArc {
  gfx: Graphics;
  life: number;
  maxLife: number;
}

interface ChestBurstParticle {
  gfx: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

interface FloatingRewardIcon {
  container: Container;
  life: number;
  maxLife: number;
  vy: number;
  startDelay: number;
}

export class CombatVFX {
  /** Add to worldContainer for in-world effects */
  readonly worldLayer: Container;
  /** Add to uiContainer for screen-space effects (vignette) */
  readonly screenLayer: Container;

  private damageNumbers: DamageNumber[] = [];
  private deathParticles: DeathParticle[] = [];
  private swingArcs: SwingArc[] = [];
  private chestBurstParticles: ChestBurstParticle[] = [];
  private floatingRewards: FloatingRewardIcon[] = [];
  private shakeFrames = 0;
  private shakeIntensity = 0;
  private vignette: Graphics;
  private iconCache: Map<string, Texture> = new Map();

  constructor() {
    this.worldLayer = new Container();
    this.worldLayer.label = 'combat-vfx-world';
    this.screenLayer = new Container();
    this.screenLayer.label = 'combat-vfx-screen';

    this.vignette = new Graphics();
    this.screenLayer.addChild(this.vignette);
  }

  /** Spawn a weapon swing arc at the player's position */
  spawnSwingArc(
    px: number, py: number,
    facingX: number, facingY: number,
    arcDegrees: number, range: number,
    color: number,
  ): void {
    const gfx = new Graphics();
    this.worldLayer.addChild(gfx);

    const maxLife = 10;

    if (arcDegrees >= 360) {
      // AOE ring
      gfx.circle(px, py, range);
      gfx.stroke({ color, alpha: 0.7, width: 2 });
      gfx.circle(px, py, range * 0.6);
      gfx.fill({ color, alpha: 0.15 });
    } else {
      // Directional arc slash
      const angle = Math.atan2(facingY, facingX);
      const halfArc = (arcDegrees / 2) * (Math.PI / 180);
      const startAngle = angle - halfArc;
      const endAngle = angle + halfArc;

      // Filled arc
      gfx.moveTo(px, py);
      gfx.arc(px, py, range, startAngle, endAngle);
      gfx.closePath();
      gfx.fill({ color, alpha: 0.2 });

      // Bright edge slash
      gfx.moveTo(
        px + Math.cos(startAngle) * range * 0.3,
        py + Math.sin(startAngle) * range * 0.3,
      );
      gfx.arc(px, py, range, startAngle, endAngle);
      gfx.stroke({ color, alpha: 0.8, width: 2 });

      // Inner slash line for style
      gfx.moveTo(px, py);
      gfx.lineTo(
        px + Math.cos(angle) * range * 1.1,
        py + Math.sin(angle) * range * 1.1,
      );
      gfx.stroke({ color: 0xffffff, alpha: 0.5, width: 1 });
    }

    this.swingArcs.push({ gfx, life: maxLife, maxLife });
  }

  /** Spawn floating damage number */
  spawnDamageNumber(x: number, y: number, damage: number, isPlayerDamage: boolean): void {
    const color = isPlayerDamage ? 0xff4444 : 0xffcc44;
    const text = new Text({
      text: `${damage}`,
      style: new TextStyle({
        fontFamily: FONT,
        fontSize: 8,
        fill: color,
        fontWeight: 'bold',
        stroke: { color: 0x000000, width: 2 },
      }),
    });
    text.anchor.set(0.5);
    text.x = x + (Math.random() - 0.5) * 8;
    text.y = y - 8;
    this.worldLayer.addChild(text);
    this.damageNumbers.push({ text, life: 30, vy: -0.4 });
  }

  /** Spawn death particles at position */
  spawnDeathParticles(x: number, y: number, color: number): void {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const speed = 1.0 + Math.random() * 1.5;
      const gfx = new Graphics();
      gfx.rect(-1.5, -1.5, 3, 3);
      gfx.fill(color);
      gfx.x = x;
      gfx.y = y;
      this.worldLayer.addChild(gfx);
      this.deathParticles.push({
        gfx,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 20,
      });
    }
  }

  /** Resolve an item_type to its icon path */
  private getIconPath(itemType: string): string | null {
    if (itemType === 'token') return '/icons/hud/token_symbol.png';
    if (itemType.startsWith('material:')) {
      const mat = itemType.slice('material:'.length);
      return `/icons/crafting_materials/${mat}.png`;
    }
    if (itemType.startsWith('blueprint:')) {
      const bp = itemType.slice('blueprint:'.length);
      const BLUEPRINT_ICONS: Record<string, string> = {
        Pylon: '/blueprints/fc1246.png',
        ComputeFarm: '/blueprints/fc1256.png',
        TodoApp: '/blueprints/fc1261.png',
        Calculator: '/blueprints/fc1262.png',
        LandingPage: '/blueprints/fc1263.png',
        WeatherDashboard: '/blueprints/fc1267.png',
        ChatApp: '/blueprints/fc1269.png',
        KanbanBoard: '/blueprints/fc1272.png',
        EcommerceStore: '/blueprints/fc1276.png',
        AiImageGenerator: '/blueprints/fc1277.png',
        ApiDashboard: '/blueprints/fc1278.png',
        Blockchain: '/blueprints/fc1279.png',
      };
      return BLUEPRINT_ICONS[bp] ?? null;
    }
    return null;
  }

  /** Spawn golden burst particles and floating reward icons above the player */
  async spawnChestRewards(
    px: number, py: number,
    rewards: { item_type: string; count: number }[],
  ): Promise<void> {
    // Golden particle burst
    const burstCount = 12;
    for (let i = 0; i < burstCount; i++) {
      const angle = (i / burstCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const speed = 0.8 + Math.random() * 1.2;
      const gfx = new Graphics();
      const size = 1.5 + Math.random() * 1.5;
      gfx.circle(0, 0, size);
      gfx.fill(Math.random() > 0.3 ? 0xffd700 : 0xffa500);
      gfx.x = px;
      gfx.y = py;
      this.worldLayer.addChild(gfx);
      const maxLife = 18 + Math.floor(Math.random() * 12);
      this.chestBurstParticles.push({
        gfx,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        life: maxLife,
        maxLife,
      });
    }

    // Floating reward icons above the player
    for (let i = 0; i < rewards.length; i++) {
      const reward = rewards[i];
      const iconPath = this.getIconPath(reward.item_type);

      const container = new Container();

      // Try to load and show icon
      if (iconPath) {
        let tex = this.iconCache.get(iconPath);
        if (!tex) {
          try {
            tex = await Assets.load<Texture>(iconPath);
            this.iconCache.set(iconPath, tex);
          } catch { /* fallback to text only */ }
        }
        if (tex) {
          const spr = new Sprite(tex);
          spr.width = 12;
          spr.height = 12;
          spr.anchor.set(0.5);
          spr.x = 0;
          spr.y = 0;
          container.addChild(spr);
        }
      }

      // Count label to the right of the icon
      const label = reward.item_type === 'token'
        ? `+${reward.count}`
        : reward.count > 1 ? `x${reward.count}` : '';
      if (label) {
        const text = new Text({
          text: label,
          style: new TextStyle({
            fontFamily: FONT,
            fontSize: 6,
            fill: reward.item_type === 'token' ? 0xffd700 : 0xffffff,
            fontWeight: 'bold',
            stroke: { color: 0x000000, width: 2 },
          }),
        });
        text.anchor.set(0, 0.5);
        text.x = 8;
        text.y = 0;
        container.addChild(text);
      }

      // Spread items horizontally, stagger vertically with delay
      const spread = rewards.length > 1
        ? (i - (rewards.length - 1) / 2) * 14
        : 0;
      container.x = px + spread;
      container.y = py - 12;
      container.alpha = 0;

      this.worldLayer.addChild(container);
      const maxLife = 60;
      this.floatingRewards.push({
        container,
        life: maxLife,
        maxLife,
        vy: -0.25,
        startDelay: i * 4,
      });
    }
  }

  /** Trigger screen shake */
  triggerShake(intensity: number, frames: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeFrames = Math.max(this.shakeFrames, frames);
  }

  /** Get current shake offset (apply to camera) */
  getShakeOffset(): { x: number; y: number } {
    if (this.shakeFrames <= 0) return { x: 0, y: 0 };
    const t = this.shakeFrames / 8;
    return {
      x: (Math.random() - 0.5) * this.shakeIntensity * t,
      y: (Math.random() - 0.5) * this.shakeIntensity * t,
    };
  }

  /** Update low HP vignette */
  updateVignette(healthPct: number, screenW: number, screenH: number): void {
    this.vignette.clear();
    if (healthPct < 0.25 && healthPct > 0) {
      const pulse = 0.15 + Math.sin(Date.now() / 300) * 0.1;
      this.vignette.rect(0, 0, screenW, screenH);
      this.vignette.fill({ color: 0xff0000, alpha: pulse });
    }
  }

  /** Tick all effects */
  update(): void {
    // Swing arcs
    for (let i = this.swingArcs.length - 1; i >= 0; i--) {
      const arc = this.swingArcs[i];
      arc.life--;
      arc.gfx.alpha = arc.life / arc.maxLife;
      if (arc.life <= 0) {
        this.worldLayer.removeChild(arc.gfx);
        arc.gfx.destroy();
        this.swingArcs.splice(i, 1);
      }
    }

    // Damage numbers
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.life--;
      dn.text.y += dn.vy;
      dn.text.alpha = dn.life / 30;
      if (dn.life <= 0) {
        this.worldLayer.removeChild(dn.text);
        dn.text.destroy();
        this.damageNumbers.splice(i, 1);
      }
    }

    // Death particles
    for (let i = this.deathParticles.length - 1; i >= 0; i--) {
      const p = this.deathParticles[i];
      p.life--;
      p.gfx.x += p.vx;
      p.gfx.y += p.vy;
      p.gfx.alpha = p.life / 20;
      if (p.life <= 0) {
        this.worldLayer.removeChild(p.gfx);
        p.gfx.destroy();
        this.deathParticles.splice(i, 1);
      }
    }

    // Chest burst particles
    for (let i = this.chestBurstParticles.length - 1; i >= 0; i--) {
      const p = this.chestBurstParticles[i];
      p.life--;
      p.gfx.x += p.vx;
      p.gfx.y += p.vy;
      p.vy += 0.03; // slight gravity
      p.gfx.alpha = p.life / p.maxLife;
      p.gfx.scale.set(p.life / p.maxLife);
      if (p.life <= 0) {
        this.worldLayer.removeChild(p.gfx);
        p.gfx.destroy();
        this.chestBurstParticles.splice(i, 1);
      }
    }

    // Floating reward icons
    for (let i = this.floatingRewards.length - 1; i >= 0; i--) {
      const r = this.floatingRewards[i];
      if (r.startDelay > 0) {
        r.startDelay--;
        continue;
      }
      r.life--;
      r.container.y += r.vy;
      // Fade in for first 10 frames, fade out for last 15
      const fadeIn = Math.min(1, (r.maxLife - r.life) / 10);
      const fadeOut = Math.min(1, r.life / 15);
      r.container.alpha = fadeIn * fadeOut;
      if (r.life <= 0) {
        this.worldLayer.removeChild(r.container);
        r.container.destroy({ children: true });
        this.floatingRewards.splice(i, 1);
      }
    }

    // Shake decay
    if (this.shakeFrames > 0) {
      this.shakeFrames--;
      if (this.shakeFrames <= 0) {
        this.shakeIntensity = 0;
      }
    }
  }
}
