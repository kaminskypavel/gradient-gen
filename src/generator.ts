export type ShapeTemplate =
  | "waves"
  | "orbs"
  | "aurora"
  | "mesh"
  | "ribbons"
  | "crystals"
  | "random";

export const TEMPLATES: { id: ShapeTemplate; label: string }[] = [
  { id: "random", label: "Random" },
  { id: "waves", label: "Waves" },
  { id: "orbs", label: "Orbs" },
  { id: "aurora", label: "Aurora" },
  { id: "mesh", label: "Mesh" },
  { id: "ribbons", label: "Ribbons" },
  { id: "crystals", label: "Crystals" },
];

export interface GeneratedResult {
  imageData: ImageData;
  w: number;
  h: number;
  color1: string;
  color2: string;
  seed: number;
  template: ShapeTemplate;
  sharpness: number;
}

type RGB = [number, number, number];
type RandFn = () => number;

function hexToRgb(hex: string): RGB {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function lerp(a: RGB, b: RGB, t: number): RGB {
  const s = Math.max(0, Math.min(1, t));
  return [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function smoothstep(t: number): number {
  const s = Math.max(0, Math.min(1, t));
  return s * s * (3 - 2 * s);
}

function mulberry32(seed: number): RandFn {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Palette {
  colors: RGB[];
  dark: RGB;
  darkest: RGB;
}

function buildPalette(c1: RGB, c2: RGB): Palette {
  const [h1, s1, l1] = rgbToHsl(...c1);
  const [h2, s2, l2] = rgbToHsl(...c2);
  const darkest: RGB = hslToRgb(h1, Math.max(s1 * 0.6, 10), Math.max(l1 * 0.12, 3));
  const dark: RGB = hslToRgb(h1, Math.max(s1 * 0.7, 15), Math.max(l1 * 0.25, 8));
  const mid1: RGB = hslToRgb(h1, s1, l1);
  const mid2: RGB = hslToRgb(h2, s2, l2);
  const light1: RGB = hslToRgb(h2, Math.min(s2 * 1.1, 100), Math.min(l2 * 1.3, 85));
  const light2: RGB = hslToRgb((h1 + h2) / 2, Math.min((s1 + s2) / 2, 90), Math.min(((l1 + l2) / 2) * 1.5, 90));
  const glow: RGB = hslToRgb(h2, Math.min(s2 * 0.8, 80), Math.min(l2 * 1.6, 92));
  return { colors: [darkest, dark, mid1, mid2, light1, light2, glow], dark, darkest };
}

// ─── Shared helpers ───

function blendPixel(buf: Uint8ClampedArray, i: number, c: RGB, alpha: number) {
  const inv = 1 - alpha;
  buf[i] = buf[i] * inv + c[0] * alpha;
  buf[i + 1] = buf[i + 1] * inv + c[1] * alpha;
  buf[i + 2] = buf[i + 2] * inv + c[2] * alpha;
}

function screenPixel(buf: Uint8ClampedArray, i: number, c: RGB, intensity: number) {
  buf[i] = buf[i] + c[0] * intensity - (buf[i] * c[0] * intensity) / 255;
  buf[i + 1] = buf[i + 1] + c[1] * intensity - (buf[i + 1] * c[1] * intensity) / 255;
  buf[i + 2] = buf[i + 2] + c[2] * intensity - (buf[i + 2] * c[2] * intensity) / 255;
}

function paintBase(buf: Uint8ClampedArray, w: number, h: number, pal: Palette, c1: RGB, c2: RGB, rand: RandFn) {
  // Randomize the gradient angle
  const angle = rand() * Math.PI * 2;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  for (let y = 0; y < h; y++) {
    const fy = y / h - 0.5;
    for (let x = 0; x < w; x++) {
      const fx = x / w - 0.5;
      const t = smoothstep((fx * cosA + fy * sinA + 0.5) * 1.0);
      let c: RGB;
      if (t < 0.3) c = lerp(pal.darkest, pal.dark, t / 0.3);
      else if (t < 0.6) c = lerp(pal.dark, c1, (t - 0.3) / 0.3);
      else if (t < 0.85) c = lerp(c1, c2, (t - 0.6) / 0.25);
      else c = lerp(c2, pal.dark, (t - 0.85) / 0.15);
      const i = (y * w + x) * 4;
      buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = 255;
    }
  }
}

function paintVignette(buf: Uint8ClampedArray, w: number, h: number) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x / w - 0.5) * 2;
      const dy = (y / h - 0.5) * 2;
      const d = Math.sqrt(dx * dx * 0.8 + dy * dy * 1.2);
      if (d > 0.55) {
        const darken = 1 - smoothstep((d - 0.55) / 0.65) * 0.4;
        const i = (y * w + x) * 4;
        buf[i] *= darken; buf[i + 1] *= darken; buf[i + 2] *= darken;
      }
    }
  }
}

function paintNoise(buf: Uint8ClampedArray, seed: number) {
  let s = seed;
  for (let idx = 0; idx < buf.length; idx += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const n = ((s >> 16) & 0x7) - 3;
    buf[idx] = Math.max(0, Math.min(255, buf[idx] + n));
    buf[idx + 1] = Math.max(0, Math.min(255, buf[idx + 1] + n));
    buf[idx + 2] = Math.max(0, Math.min(255, buf[idx + 2] + n));
  }
}

// ─── Shape: Waves (flowing hills) ───

function shapeWaves(buf: Uint8ClampedArray, w: number, h: number, pal: Palette, rand: RandFn, sharp = 0.5) {
  const count = 4 + Math.floor(rand() * 3);
  const hills: { baseY: number; waves: { amp: number; freq: number; phase: number }[]; top: RGB; mid: RGB; bot: RGB; glow: RGB; opacity: number; ew: number }[] = [];

  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const waveCount = 3 + Math.floor(rand() * 3);
    const waves: { amp: number; freq: number; phase: number }[] = [];
    for (let j = 0; j < waveCount; j++) {
      waves.push({ amp: (40 + rand() * 100) * (1 - j * 0.25), freq: 0.0003 + rand() * 0.005 + j * 0.003, phase: rand() * Math.PI * 2 });
    }
    const ci1 = Math.min(pal.colors.length - 1, Math.floor((1 - t) * (pal.colors.length - 2) + rand() * 1.5));
    const ci2 = Math.min(pal.colors.length - 1, ci1 + 1 + Math.floor(rand() * 2));
    const ci3 = Math.min(pal.colors.length - 1, Math.floor(t * (pal.colors.length - 1)));
    const baseEw = (25 + rand() * 30) * (1 - sharp * 0.85);
    hills.push({ baseY: h * (0.3 + t * 0.48 + (rand() - 0.5) * 0.08), waves, top: pal.colors[ci1], mid: pal.colors[ci2], bot: pal.colors[ci3], glow: pal.colors[Math.min(ci1 + 1, pal.colors.length - 1)], opacity: 0.5 + t * 0.4, ew: Math.max(2, baseEw) });
  }
  hills.sort((a, b) => a.baseY - b.baseY);

  for (const hill of hills) {
    for (let x = 0; x < w; x++) {
      let wy = hill.baseY;
      for (const wv of hill.waves) wy += wv.amp * Math.sin(wv.freq * x + wv.phase);
      const startY = Math.max(0, Math.floor(wy - hill.ew));
      for (let y = startY; y < h; y++) {
        const dist = y - wy;
        let alpha: number, c: RGB;
        if (dist < 0) {
          const edgeT = smoothstep(1 - Math.abs(dist) / hill.ew);
          alpha = edgeT * hill.opacity * 0.5;
          c = lerp(hill.top, hill.glow, edgeT);
        } else {
          const depth = Math.min(1, dist / (h - wy));
          c = depth < 0.3 ? lerp(hill.top, hill.mid, depth / 0.3) : lerp(hill.mid, hill.bot, (depth - 0.3) / 0.7);
          const fadeIn = Math.max(2, 25 * (1 - sharp * 0.9));
          alpha = smoothstep(Math.min(1, dist / fadeIn)) * hill.opacity;
        }
        if (alpha > 0.01) blendPixel(buf, (y * w + x) * 4, c, alpha);
      }
    }
  }
}

// ─── Shape: Orbs (overlapping spheres) ───

function shapeOrbs(buf: Uint8ClampedArray, w: number, h: number, pal: Palette, rand: RandFn, sharp = 0.5) {
  const count = 5 + Math.floor(rand() * 8);
  const orbs: { cx: number; cy: number; r: number; color: RGB; opacity: number }[] = [];

  for (let i = 0; i < count; i++) {
    orbs.push({
      cx: rand() * w,
      cy: rand() * h,
      r: w * (0.08 + rand() * 0.3),
      color: pal.colors[2 + Math.floor(rand() * (pal.colors.length - 2))],
      opacity: 0.3 + rand() * 0.5,
    });
  }
  // Sort by size — big ones first (background)
  orbs.sort((a, b) => b.r - a.r);

  for (const orb of orbs) {
    const x0 = Math.max(0, Math.floor(orb.cx - orb.r));
    const x1 = Math.min(w, Math.ceil(orb.cx + orb.r));
    const y0 = Math.max(0, Math.floor(orb.cy - orb.r));
    const y1 = Math.min(h, Math.ceil(orb.cy + orb.r));

    for (let y = y0; y < y1; y++) {
      const dy = (y - orb.cy) / orb.r;
      const dy2 = dy * dy;
      for (let x = x0; x < x1; x++) {
        const dx = (x - orb.cx) / orb.r;
        const d2 = dx * dx + dy2;
        if (d2 < 1) {
          const d = Math.sqrt(d2);
          // Sphere-like shading: bright on top-left, dark on bottom-right
          const lightAngle = (-dx * 0.6 - dy * 0.8 + 1) / 2;
          const shade = smoothstep(lightAngle);
          const c = lerp(pal.dark, orb.color, shade);
          // sharp controls edge falloff: 0=soft gaussian, 1=hard cutoff
          const edgePow = 1 + sharp * 4; // 1..5
          const alpha = (1 - d ** edgePow) * orb.opacity;
          if (alpha > 0.01) blendPixel(buf, (y * w + x) * 4, c, alpha);
        }
      }
    }
  }
}

// ─── Shape: Aurora (vertical curtains of light) ───

function shapeAurora(buf: Uint8ClampedArray, w: number, h: number, pal: Palette, rand: RandFn, sharp = 0.5) {
  const curtainCount = 5 + Math.floor(rand() * 4);

  for (let c = 0; c < curtainCount; c++) {
    const baseX = rand() * w;
    const spread = w * (0.05 + rand() * 0.2);
    const color = pal.colors[2 + Math.floor(rand() * (pal.colors.length - 2))];
    const opacity = 0.2 + rand() * 0.4;
    const topY = h * (0.05 + rand() * 0.2);
    const botY = h * (0.6 + rand() * 0.35);
    const waveAmp = 30 + rand() * 80;
    const waveFreq = 0.002 + rand() * 0.008;
    const wavePhase = rand() * Math.PI * 2;

    for (let y = Math.max(0, Math.floor(topY)); y < Math.min(h, Math.ceil(botY)); y++) {
      const vertT = (y - topY) / (botY - topY);
      // Intensity peaks in the middle, fades at top/bottom
      const vertIntensity = Math.sin(vertT * Math.PI);
      const drift = waveAmp * Math.sin(waveFreq * y + wavePhase);
      const cx = baseX + drift;

      const x0 = Math.max(0, Math.floor(cx - spread * 2));
      const x1 = Math.min(w, Math.ceil(cx + spread * 2));
      for (let x = x0; x < x1; x++) {
        const dx = Math.abs(x - cx) / spread;
        if (dx < 2) {
          const gaussWidth = 1.5 + sharp * 6; // tighter gaussian = sharper edges
          const horizFade = Math.exp(-dx * dx * gaussWidth);
          const alpha = horizFade * vertIntensity * opacity;
          if (alpha > 0.01) {
            const brightened = lerp(color, pal.colors[pal.colors.length - 1], vertIntensity * 0.3);
            screenPixel(buf, (y * w + x) * 4, brightened, alpha);
          }
        }
      }
    }
  }
}

// ─── Shape: Mesh (Voronoi-like mesh gradient) ───

function shapeMesh(buf: Uint8ClampedArray, w: number, h: number, pal: Palette, rand: RandFn) {
  const pointCount = 6 + Math.floor(rand() * 6);
  const points: { x: number; y: number; color: RGB }[] = [];

  for (let i = 0; i < pointCount; i++) {
    points.push({
      x: rand() * w,
      y: rand() * h,
      color: pal.colors[Math.floor(rand() * pal.colors.length)],
    });
  }

  // For speed, process in 2x2 blocks
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      // Find two closest points
      let d1 = Infinity, d2 = Infinity;
      let p1 = 0, p2 = 0;
      for (let p = 0; p < points.length; p++) {
        const dx = x - points[p].x;
        const dy = y - points[p].y;
        const d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; p2 = p1; d1 = d; p1 = p; }
        else if (d < d2) { d2 = d; p2 = p; }
      }

      const sd1 = Math.sqrt(d1);
      const sd2 = Math.sqrt(d2);
      const t = sd1 / (sd1 + sd2);
      const c = lerp(points[p1].color, points[p2].color, smoothstep(t));

      // Write 2x2 block
      for (let dy = 0; dy < 2 && y + dy < h; dy++) {
        for (let dx = 0; dx < 2 && x + dx < w; dx++) {
          const i = ((y + dy) * w + (x + dx)) * 4;
          blendPixel(buf, i, c, 0.75);
        }
      }
    }
  }
}

// ─── Shape: Ribbons (flowing diagonal bands) ───

function shapeRibbons(buf: Uint8ClampedArray, w: number, h: number, pal: Palette, rand: RandFn, sharp = 0.5) {
  const ribbonCount = 4 + Math.floor(rand() * 4);

  for (let r = 0; r < ribbonCount; r++) {
    const color = pal.colors[2 + Math.floor(rand() * (pal.colors.length - 2))];
    const edgeColor = pal.colors[Math.min(pal.colors.length - 1, 4 + Math.floor(rand() * 3))];
    const opacity = 0.4 + rand() * 0.4;
    const thickness = h * (0.04 + rand() * 0.12);
    const angle = (rand() - 0.5) * 1.2; // slight diagonal
    const cosA = Math.cos(angle), sinA = Math.sin(angle);
    const offset = (rand() - 0.5) * h * 1.5;

    // Wave distortion along the ribbon
    const waveParams = [
      { amp: 30 + rand() * 80, freq: 0.001 + rand() * 0.004, phase: rand() * Math.PI * 2 },
      { amp: 15 + rand() * 40, freq: 0.003 + rand() * 0.008, phase: rand() * Math.PI * 2 },
    ];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Project onto ribbon's perpendicular axis
        const projected = (x - w / 2) * sinA - (y - h / 2) * cosA + offset;
        let waveOffset = 0;
        const along = (x - w / 2) * cosA + (y - h / 2) * sinA;
        for (const wp of waveParams) waveOffset += wp.amp * Math.sin(wp.freq * along + wp.phase);

        const dist = Math.abs(projected + waveOffset);
        if (dist < thickness) {
          const t = dist / thickness;
          const edgeCurve = sharp > 0.5 ? Math.max(0, 1 - t ** (1 + sharp * 3)) : 1 - smoothstep(t);
          const alpha = edgeCurve * opacity;
          // Bright edge
          const edgeT = smoothstep(1 - t);
          const c = lerp(color, edgeColor, edgeT * 0.4);
          if (alpha > 0.01) blendPixel(buf, (y * w + x) * 4, c, alpha);
        }
      }
    }
  }
}

// ─── Shape: Crystals (angular geometric facets) ───

function shapeCrystals(buf: Uint8ClampedArray, w: number, h: number, pal: Palette, rand: RandFn) {
  // Generate random triangles/quads as facets
  const facetCount = 8 + Math.floor(rand() * 10);

  interface Facet {
    points: { x: number; y: number }[];
    color: RGB;
    opacity: number;
  }

  const facets: Facet[] = [];

  for (let f = 0; f < facetCount; f++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const size = Math.min(w, h) * (0.1 + rand() * 0.35);
    const vertexCount = 3 + Math.floor(rand() * 3); // 3-5 vertices
    const points: { x: number; y: number }[] = [];
    const startAngle = rand() * Math.PI * 2;

    for (let v = 0; v < vertexCount; v++) {
      const angle = startAngle + (v / vertexCount) * Math.PI * 2 + (rand() - 0.5) * 0.5;
      const r = size * (0.5 + rand() * 0.5);
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }

    facets.push({
      points,
      color: pal.colors[1 + Math.floor(rand() * (pal.colors.length - 1))],
      opacity: 0.25 + rand() * 0.45,
    });
  }

  // Point-in-polygon test (ray casting)
  function pointInPoly(px: number, py: number, pts: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const yi = pts[i].y, yj = pts[j].y;
      if ((yi > py) !== (yj > py) && px < ((pts[j].x - pts[i].x) * (py - yi)) / (yj - yi) + pts[i].x) {
        inside = !inside;
      }
    }
    return inside;
  }

  for (const facet of facets) {
    // Bounding box
    let minX = w, maxX = 0, minY = h, maxY = 0;
    for (const p of facet.points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const x0 = Math.max(0, Math.floor(minX));
    const x1 = Math.min(w, Math.ceil(maxX));
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(h, Math.ceil(maxY));

    // Centroid for gradient direction
    const centX = facet.points.reduce((s, p) => s + p.x, 0) / facet.points.length;
    const centY = facet.points.reduce((s, p) => s + p.y, 0) / facet.points.length;
    const maxDist = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2) / 2;

    // Lighter variation for inner gradient
    const innerColor = lerp(facet.color, pal.colors[pal.colors.length - 1], 0.3);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (pointInPoly(x, y, facet.points)) {
          const d = Math.sqrt((x - centX) ** 2 + (y - centY) ** 2) / maxDist;
          const c = lerp(innerColor, facet.color, smoothstep(d));
          blendPixel(buf, (y * w + x) * 4, c, facet.opacity);
        }
      }
    }

    // Edge glow
    for (let e = 0; e < facet.points.length; e++) {
      const p1 = facet.points[e];
      const p2 = facet.points[(e + 1) % facet.points.length];
      const edgeLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      const steps = Math.ceil(edgeLen);
      const glowRadius = 8;

      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const ex = p1.x + (p2.x - p1.x) * t;
        const ey = p1.y + (p2.y - p1.y) * t;

        for (let gy = Math.max(0, Math.floor(ey - glowRadius)); gy < Math.min(h, Math.ceil(ey + glowRadius)); gy++) {
          for (let gx = Math.max(0, Math.floor(ex - glowRadius)); gx < Math.min(w, Math.ceil(ex + glowRadius)); gx++) {
            const gd = Math.sqrt((gx - ex) ** 2 + (gy - ey) ** 2) / glowRadius;
            if (gd < 1) {
              const ga = (1 - gd) * 0.15 * facet.opacity;
              screenPixel(buf, (gy * w + gx) * 4, pal.colors[pal.colors.length - 1], ga);
            }
          }
        }
      }
    }
  }
}

// ─── Shared: aurora accent glows ───

function paintAuroraGlows(buf: Uint8ClampedArray, w: number, h: number, pal: Palette, rand: RandFn, sharp = 0.5) {
  const count = 2 + Math.floor(rand() * 3);
  for (let g = 0; g < count; g++) {
    const cx = rand() * w, cy = rand() * h * 0.6;
    const rx = w * (0.15 + rand() * 0.35), ry = h * (0.1 + rand() * 0.2);
    const gc = pal.colors[2 + Math.floor(rand() * (pal.colors.length - 2))];
    const strength = 0.06 + rand() * 0.14;
    const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(w, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(h, Math.ceil(cy + ry));
    for (let y = y0; y < y1; y++) {
      const dy2 = ((y - cy) / ry) ** 2;
      for (let x = x0; x < x1; x++) {
        const d2 = ((x - cx) / rx) ** 2 + dy2;
        if (d2 < 1) {
          const glowPow = 1.5 + sharp * 3;
          screenPixel(buf, (y * w + x) * 4, gc, (1 - d2) ** glowPow * strength);
        }
      }
    }
  }
}

// ─── Main generate function ───

const SHAPE_TEMPLATES = ["waves", "orbs", "aurora", "mesh", "ribbons", "crystals"] as const;

export function generate(
  w: number,
  h: number,
  color1: string,
  color2: string,
  seed?: number,
  template: ShapeTemplate = "random",
  sharpness = 50,
): GeneratedResult {
  const actualSeed = seed ?? (Date.now() ^ (Math.random() * 0xffffffff));
  const rand = mulberry32(actualSeed);

  const resolvedTemplate: ShapeTemplate =
    template === "random"
      ? SHAPE_TEMPLATES[Math.floor(rand() * SHAPE_TEMPLATES.length)]
      : template;

  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  const pal = buildPalette(c1, c2);
  const data = new ImageData(w, h);
  const buf = data.data;

  const sharp = Math.max(0, Math.min(1, sharpness / 100));

  // Base
  paintBase(buf, w, h, pal, c1, c2, rand);

  // Shape layer
  switch (resolvedTemplate) {
    case "waves": shapeWaves(buf, w, h, pal, rand, sharp); break;
    case "orbs": shapeOrbs(buf, w, h, pal, rand, sharp); break;
    case "aurora": shapeAurora(buf, w, h, pal, rand, sharp); break;
    case "mesh": shapeMesh(buf, w, h, pal, rand); break;
    case "ribbons": shapeRibbons(buf, w, h, pal, rand, sharp); break;
    case "crystals": shapeCrystals(buf, w, h, pal, rand); break;
  }

  // Accent glows
  paintAuroraGlows(buf, w, h, pal, rand, sharp);

  // Vignette + noise
  paintVignette(buf, w, h);
  paintNoise(buf, actualSeed);

  return { imageData: data, w, h, color1, color2, seed: actualSeed, template: resolvedTemplate, sharpness };
}
