import { useRef, useEffect } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
  type: 'ember' | 'spark' | 'mote' | 'dust';
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}

// Amber embers — slow upward drift from lower half, warm glow
function createEmber(w: number, h: number): Particle {
  // Slight color variation: amber to warm orange
  const variant = Math.random();
  let r: number, g: number, b: number;
  if (variant < 0.7) {
    r = randInt(200, 220); g = randInt(140, 170); b = randInt(15, 35);
  } else if (variant < 0.9) {
    r = randInt(200, 215); g = randInt(100, 130); b = randInt(30, 50);
  } else {
    r = randInt(180, 200); g = randInt(70, 100); b = randInt(40, 60);
  }
  return {
    x: rand(0, w),
    y: rand(h * 0.5, h * 1.15),
    vx: rand(-0.3, 0.3),
    vy: rand(-0.7, -0.2),
    life: 0,
    maxLife: rand(220, 480),
    size: rand(1.5, 3.5),
    r, g, b,
    type: 'ember',
  };
}

// Cyan sparks — fast, short-lived, glitchy energy
function createSpark(w: number, h: number): Particle {
  const bright = Math.random() > 0.8;
  return {
    x: rand(w * 0.1, w * 0.9),
    y: rand(h * 0.1, h * 0.9),
    vx: rand(-2.5, 2.5),
    vy: rand(-2.5, 2.5),
    life: 0,
    maxLife: rand(12, 45),
    size: rand(0.8, 2.2),
    r: bright ? randInt(140, 180) : randInt(60, 90),
    g: bright ? randInt(220, 245) : randInt(190, 215),
    b: bright ? randInt(215, 235) : randInt(180, 200),
    type: 'spark',
  };
}

// Green motes — slow floating toxic pollen
function createMote(w: number, h: number): Particle {
  return {
    x: rand(0, w),
    y: rand(0, h),
    vx: rand(-0.12, 0.12),
    vy: rand(-0.18, 0.18),
    life: 0,
    maxLife: rand(320, 550),
    size: rand(1, 2.5),
    r: randInt(50, 90),
    g: randInt(160, 200),
    b: randInt(50, 90),
    type: 'mote',
  };
}

// Grey dust — ambient atmosphere
function createDust(w: number, h: number): Particle {
  const brightness = randInt(130, 200);
  return {
    x: rand(0, w),
    y: rand(0, h),
    vx: rand(-0.18, 0.18),
    vy: rand(-0.12, 0.12),
    life: 0,
    maxLife: rand(160, 340),
    size: rand(0.4, 1.2),
    r: brightness,
    g: brightness,
    b: brightness + randInt(0, 20),
    type: 'dust',
  };
}

const COUNTS = { ember: 45, spark: 22, mote: 30, dust: 55 } as const;

const creators = {
  ember: createEmber,
  spark: createSpark,
  mote: createMote,
  dust: createDust,
} as const;

export function Particles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    // Build particle pool
    const particles: Particle[] = [];
    for (const [type, count] of Object.entries(COUNTS)) {
      for (let i = 0; i < count; i++) {
        const p = creators[type as keyof typeof COUNTS](w, h);
        // Stagger initial life so they don't all spawn at once
        p.life = rand(0, p.maxLife * 0.85);
        particles.push(p);
      }
    }

    let animId: number;

    function tick() {
      ctx!.clearRect(0, 0, w, h);
      // Additive blending for glow
      ctx!.globalCompositeOperation = 'lighter';

      for (const p of particles) {
        p.life++;

        if (p.life >= p.maxLife) {
          Object.assign(p, creators[p.type](w, h));
          continue;
        }

        // Movement
        p.x += p.vx;
        p.y += p.vy;

        // Type-specific behavior
        if (p.type === 'ember') {
          p.vx += rand(-0.02, 0.02);
          p.vx = Math.max(-0.5, Math.min(0.5, p.vx));
        } else if (p.type === 'spark') {
          p.vx *= 0.97;
          p.vy *= 0.97;
        } else if (p.type === 'mote') {
          p.vx += Math.sin(p.life * 0.015) * 0.004;
          p.vy += Math.cos(p.life * 0.012) * 0.003;
        }

        // Fade curve: quick fade in, hold, slow fade out
        const t = p.life / p.maxLife;
        let alpha: number;
        if (t < 0.08) {
          alpha = t / 0.08;
        } else if (t > 0.65) {
          alpha = (1 - t) / 0.35;
        } else {
          alpha = 1;
        }

        // Per-type intensity
        const intensity =
          p.type === 'ember' ? 0.7 :
          p.type === 'spark' ? 0.95 :
          p.type === 'mote' ? 0.45 :
          0.25;
        alpha *= intensity;

        if (alpha <= 0.01) continue;

        // Core particle
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha})`;
        ctx!.fill();

        // Glow halo for embers and sparks
        if ((p.type === 'spark' || p.type === 'ember') && alpha > 0.2) {
          ctx!.beginPath();
          ctx!.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha * 0.12})`;
          ctx!.fill();
        }
      }

      // Reset compositing
      ctx!.globalCompositeOperation = 'source-over';
      animId = requestAnimationFrame(tick);
    }

    function handleResize() {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w;
      canvas!.height = h;
    }

    window.addEventListener('resize', handleResize);
    animId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    />
  );
}
