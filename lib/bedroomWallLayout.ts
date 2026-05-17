import {
  type Project,
  type ProjectPriority,
  type ProjectSize,
} from "@/lib/projects";

/** Per-poster placement from the wall algorithm (pure; safe to run at build / on the server). */
export type PosterWallLayout = {
  topPct: number;
  leftPct: number;
  /** CSS width, e.g. clamp(140px, 12vw, 260px) */
  width: string;
  zIndex: number;
  rotateDeg: number;
  /** Hand-placement jitter (px), applied with grid centering. */
  offsetXPx: number;
  offsetYPx: number;
};

function widthForProjectSize(size: ProjectSize): string {
  switch (size) {
    case "xl":
      return "clamp(88px, 13.2vw, 238px)";
    case "lg":
      return "clamp(80px, 11.2vw, 205px)";
    case "md":
      return "clamp(74px, 9.4vw, 178px)";
    case "sm":
      return "clamp(62px, 7.6vw, 148px)";
  }
}

const SIZE_SEP_PCT: Record<ProjectSize, number> = {
  xl: 13.5,
  lg: 12,
  md: 9.2,
  sm: 7.4,
};

function sepMin(a: ProjectSize, b: ProjectSize): number {
  return (SIZE_SEP_PCT[a] + SIZE_SEP_PCT[b]) * 0.48;
}

function recencyScore(idx: number, p: Project): number {
  const y = parseInt(p.year, 10);
  const yearPart = Number.isFinite(y) ? y : 0;
  return yearPart * 10_000 + (1_000 - Math.min(idx, 999));
}

const PR_RANK: Record<ProjectPriority, number> = {
  hero: 320_000,
  large: 150_000,
  standard: 35_000,
  small: 8_000,
};

const HALF_WIDTH_VW: Record<ProjectSize, number> = {
  xl: 13.2 / 2,
  lg: 11.2 / 2,
  md: 9.4 / 2,
  sm: 7.6 / 2,
};

const WALL_H_INSET_PCT = 5;
const WALL_RIGHT_LABEL_GUTTER_PCT = 14;
const WALL_HAND_SLACK_PCT = 2.6;

function effectiveHalfWidthPct(size: ProjectSize): number {
  return HALF_WIDTH_VW[size] + WALL_HAND_SLACK_PCT;
}

function clampWallLeftPct(leftPct: number, size: ProjectSize): number {
  const hw = effectiveHalfWidthPct(size);
  const minC = WALL_H_INSET_PCT + hw;
  const maxC = 100 - WALL_H_INSET_PCT - WALL_RIGHT_LABEL_GUTTER_PCT - hw;
  return Math.min(maxC, Math.max(minC, leftPct));
}

function nudgeLeftClusterTowardCenter(leftPct: number): number {
  if (leftPct >= 40) return leftPct;
  return leftPct + (40 - leftPct) * 0.48;
}

const MANDATORY_HERO_SLUGS = [
  "doja-cat-gorgeous",
  "sabrina-carpenter-taste",
  "lil-dicky-hahaha-i-love-myself",
] as const;

const MANDATORY_HERO_SLUG_SET = new Set<string>(MANDATORY_HERO_SLUGS);

const ANCHOR_SLOT_BY_SLUG: Record<string, { left: number; top: number }> = {
  "doja-cat-gorgeous": { left: 50, top: 18.2 },
  "sabrina-carpenter-taste": { left: 35.8, top: 24.8 },
  "lil-dicky-hahaha-i-love-myself": { left: 64.2, top: 24.8 },
};

const HERO_OPTIONAL_SLOTS: Array<{ left: number; top: number }> = [
  { left: 23.5, top: 22.6 },
  { left: 76.5, top: 22.6 },
  { left: 42, top: 18.8 },
  { left: 58, top: 25.4 },
];

const PROMINENT_RECENT_N = 7;
const PROMINENT_IMP_BUMP = 320_000;

/** Newest seven sit above all other closed posters (open/hover/drag handled in BedroomPoster). */
const PROM_Z_TOP = 76;
const PROM_Z_SUB = 75;
/** Hard ceiling for anything not in the newest-seven set. */
const NON_PROM_Z_CAP = 64;

/**
 * Extra size tiers for the seven newest (permuted by slug so they’re not uniform).
 * One `0` keeps a smaller “natural” straggler; twos add hero-scale variety without all `xl`.
 */
const PROMINENT_EXTRA_STEPS = [2, 1, 2, 1, 1, 1, 0] as const;

/** Wider gap vs prominent slabs so neighbors don’t swallow >~20% of their footprint. */
const PROM_SEP_GUARD = 1.34;

const SIZE_RANK: Record<ProjectSize, number> = { sm: 0, md: 1, lg: 2, xl: 3 };
const RANK_TO_SIZE: ProjectSize[] = ["sm", "md", "lg", "xl"];

function prominentLayoutSize(p: Project, orderIndex: number): ProjectSize {
  const base = SIZE_RANK[p.size];
  const perm = Math.floor(
    hash01(p.slug, 901) * PROMINENT_EXTRA_STEPS.length,
  );
  const extra =
    PROMINENT_EXTRA_STEPS[
      (orderIndex + perm) % PROMINENT_EXTRA_STEPS.length
    ]!;
  return RANK_TO_SIZE[Math.min(3, base + extra)]!;
}

function importance(idx: number, p: Project): number {
  let v = recencyScore(idx, p);
  v += PR_RANK[p.priority];
  if (p.featured) v += 55_000;
  const szBump = { xl: 12_000, lg: 8_000, md: 3_000, sm: 0 };
  v += szBump[p.size];
  return v;
}

function hash01(slug: string, salt: number): number {
  let h = salt * 374761393;
  for (let i = 0; i < slug.length; i++) {
    h = (h + slug.charCodeAt(i) * (i + 97)) >>> 0;
  }
  return ((h % 10_000) + 10_000) % 10_000 / 10_000;
}

function handOffsetPx(slug: string, k: number, axis: 0 | 1): number {
  let h = k * 140973497 + axis * 7903991;
  for (let i = 0; i < slug.length; i++) {
    h = (h + slug.charCodeAt(i) * (i * 7 + axis + 2)) >>> 0;
  }
  const mag = 10 + (h % 11);
  const sign = (h >>> 5) & 1 ? 1 : -1;
  return sign * mag;
}

function rotateDegFor(slug: string, k: number): number {
  let h = k * 2654435761;
  for (let i = 0; i < slug.length; i++) {
    h = (h + slug.charCodeAt(i) * (i + 3)) >>> 0;
  }
  const t = (h % 1000) / 1000;
  return -2 + t * 4;
}

type Placed = { left: number; top: number; size: ProjectSize; prominent: boolean };

function minSepOk(
  left: number,
  top: number,
  size: ProjectSize,
  placed: Placed[],
  sepMul = 1,
  selfProminent = false,
): boolean {
  for (const q of placed) {
    let need = sepMin(size, q.size) * sepMul;
    if (q.prominent || selfProminent) need *= PROM_SEP_GUARD;
    const dx = (left - q.left) * 0.92;
    const dy = top - q.top;
    if (dx * dx + dy * dy < need * need) return false;
  }
  return true;
}

function sepMulForTop(top: number): number {
  if (top < 39) return 1.22;
  if (top < 54) return 1.02;
  if (top < 64) return 0.84;
  return 0.62;
}

type WallMeta = {
  idx: number;
  p: Project;
  imp: number;
  layoutSize: ProjectSize;
};

function compareNewestFirst(a: WallMeta, b: WallMeta): number {
  const ay = parseInt(a.p.year, 10);
  const by = parseInt(b.p.year, 10);
  const aY = Number.isFinite(ay) ? ay : -Infinity;
  const bY = Number.isFinite(by) ? by : -Infinity;
  if (bY !== aY) return bY - aY;
  return a.idx - b.idx;
}

function compareFillPriority(a: WallMeta, b: WallMeta): number {
  if (b.imp !== a.imp) return b.imp - a.imp;
  return compareNewestFirst(a, b);
}

function orderForFill(items: WallMeta[]): WallMeta[] {
  const buckets = new Map<ProjectSize, WallMeta[]>();
  for (const s of ["sm", "md", "lg", "xl"] as ProjectSize[]) {
    buckets.set(s, []);
  }
  for (const it of items) {
    buckets.get(it.layoutSize)!.push(it);
  }
  for (const arr of buckets.values()) {
    arr.sort((a, b) => compareFillPriority(a, b));
  }

  const pattern: ProjectSize[] = ["sm", "md", "sm", "lg", "md", "sm", "xl", "md", "sm", "lg"];
  const out: WallMeta[] = [];
  let p = 0;
  while (out.length < items.length) {
    let picked = false;
    for (let tries = 0; tries < pattern.length && !picked; tries++) {
      const want = pattern[p % pattern.length]!;
      p++;
      const b = buckets.get(want)!;
      if (b.length > 0) {
        out.push(b.shift()!);
        picked = true;
      }
    }
    if (!picked) {
      let best: ProjectSize | null = null;
      let bestLen = 0;
      for (const s of ["xl", "lg", "md", "sm"] as ProjectSize[]) {
        const L = buckets.get(s)!.length;
        if (L > bestLen) {
          bestLen = L;
          best = s;
        }
      }
      if (best && bestLen > 0) out.push(buckets.get(best)!.shift()!);
      else break;
    }
  }
  return out;
}

function generateCandidates(extra: number): Array<{ left: number; top: number }> {
  const out: Array<{ left: number; top: number }> = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const total = Math.min(240, extra);

  for (let i = 0; i < total; i++) {
    const z = i / Math.max(total - 1, 1);
    const r = 3 + Math.sqrt(i + 1) * 5.4;
    const ang = i * golden + 0.55;
    let left = 50 + Math.cos(ang) * r * 0.9;
    let top = 34 + Math.sin(ang) * r * 0.72 + z * z * 14;

    left = left * 0.62 + (22 + z * 56) * 0.38;
    top = Math.min(82, top * 0.55 + (32 + Math.pow(z, 0.85) * 44) * 0.45);

    if (i % 15 === 2) left = 8 + (i % 6) * 0.55;
    else if (i % 15 === 10) left = 92 + (i % 5) * 0.45;

    if (i % 17 === 5) top = 14 + (i % 4);
    else if (i % 17 === 12) top = 78 + (i % 4) * 0.35;

    out.push({
      left: Math.round(left * 10) / 10,
      top: Math.round(top * 10) / 10,
    });
  }
  return out;
}

const HERO_CAP = 7;

function pickHeroes(metas: WallMeta[]): WallMeta[] {
  if (metas.length <= 2) return metas.slice().sort((a, b) => compareFillPriority(a, b));

  const bySlug = new Map(metas.map((m) => [m.p.slug, m]));
  const keys: WallMeta[] = [];
  for (const slug of MANDATORY_HERO_SLUGS) {
    const m = bySlug.get(slug);
    if (m) keys.push(m);
  }
  const used = new Set(keys.map((k) => k.idx));
  const optionalMax = Math.min(
    HERO_OPTIONAL_SLOTS.length,
    Math.max(0, HERO_CAP - keys.length),
  );
  if (optionalMax === 0) return keys;

  const candidates = metas
    .filter((m) => !used.has(m.idx))
    .sort((a, b) => compareFillPriority(a, b));

  return [...keys, ...candidates.slice(0, optionalMax)];
}

/** Wall positions for `projects` (same length, index-aligned). */
export function computeWallLayouts(projects: Project[]): PosterWallLayout[] {
  const n = projects.length;
  if (n === 0) return [];

  const prelim: WallMeta[] = projects.map((p, idx) => ({
    idx,
    p,
    imp: importance(idx, p),
    layoutSize: p.size,
  }));
  const prominentOrdered = prelim
    .slice()
    .sort(compareNewestFirst)
    .slice(0, Math.min(PROMINENT_RECENT_N, prelim.length));
  const prominent = new Set(prominentOrdered.map((m) => m.idx));
  const prominentOrder = new Map<number, number>();
  for (let k = 0; k < prominentOrdered.length; k++) {
    prominentOrder.set(prominentOrdered[k]!.idx, k);
  }

  const metas: WallMeta[] = projects.map((p, idx) => {
    const isProm = prominent.has(idx);
    const orderK = prominentOrder.get(idx);
    return {
      idx,
      p,
      imp: importance(idx, p) + (isProm ? PROMINENT_IMP_BUMP : 0),
      layoutSize:
        isProm && orderK !== undefined
          ? prominentLayoutSize(p, orderK)
          : p.size,
    };
  });

  let maxImp = 0;
  for (const m of metas) maxImp = Math.max(maxImp, m.imp);

  const heroes = pickHeroes(metas);
  const heroIdx = new Set(heroes.map((h) => h.idx));
  const rest = metas.filter((m) => !heroIdx.has(m.idx));

  const placed: Placed[] = [];
  const out: PosterWallLayout[] = new Array(n);

  const heroSepMul = 1.72;
  let optSlot = 0;

  let seq = 0;
  for (let a = 0; a < heroes.length; a++) {
    const it = heroes[a]!;
    const slug = it.p.slug;
    const anchorBase = ANCHOR_SLOT_BY_SLUG[slug];
    let baseLeft: number;
    let baseTop: number;
    if (anchorBase) {
      baseLeft = anchorBase.left;
      baseTop = anchorBase.top;
    } else {
      const ex = HERO_OPTIONAL_SLOTS[optSlot++] ?? { left: 50, top: 22.5 };
      baseLeft = ex.left;
      baseTop = ex.top;
    }

    const isKeyAnchor = MANDATORY_HERO_SLUG_SET.has(slug);
    const jx = isKeyAnchor ? 2.2 : 3.4;
    const jy = isKeyAnchor ? 2.6 : 4.2;

    let left =
      baseLeft +
      (hash01(slug, 2) - 0.5) * jx +
      (hash01(slug, 3) - 0.5) * (isKeyAnchor ? 1.2 : 2.2);
    let top =
      baseTop +
      (a % 3) * (isKeyAnchor ? 0.9 : 1.4) +
      (hash01(slug, 1) - 0.5) * jy +
      (hash01(slug, 4) - 0.5) * (isKeyAnchor ? 1.4 : 2.4);

    const rn = maxImp > 0 ? it.imp / maxImp : 1;
    if (!isKeyAnchor) {
      left += (1 - rn) * 3.2;
      top -= rn * 1.6;
    }

    left = clampWallLeftPct(left, it.layoutSize);
    top = Math.max(15, Math.min(isKeyAnchor ? 28.5 : 30, top));

    const isProm = prominent.has(it.idx);
    if (isProm) {
      left += (hash01(slug, 71) - 0.5) * 3.2;
      top += (hash01(slug, 72) - 0.5) * 2.4;
      left = clampWallLeftPct(left, it.layoutSize);
      top = Math.max(15, Math.min(isKeyAnchor ? 28.5 : 30, top));
    }

    let tries = 0;
    while (
      tries < 40 &&
      !minSepOk(left, top, it.layoutSize, placed, heroSepMul, isProm)
    ) {
      left += (hash01(slug, tries + 11) - 0.5) * 2.4;
      top += (hash01(slug, tries + 22) - 0.5) * 1.8;
      left = clampWallLeftPct(left, it.layoutSize);
      tries++;
    }

    left = clampWallLeftPct(left, it.layoutSize);
    placed.push({ left, top, size: it.layoutSize, prominent: isProm });
    const offMul = isKeyAnchor ? 0.64 : 0.82;
    const ox = Math.round(handOffsetPx(it.p.slug, seq, 0) * offMul);
    const oy = Math.round(handOffsetPx(it.p.slug, seq, 1) * offMul);
    const z =
      22 +
      Math.round(rn * 10) +
      (it.p.priority === "hero" ? 24 : it.p.priority === "large" ? 12 : 0);

    const rotMul = isKeyAnchor ? 0.52 : 0.68;
    out[it.idx] = {
      topPct: Math.round(top * 10) / 10,
      leftPct: Math.round(left * 10) / 10,
      width: widthForProjectSize(it.layoutSize),
      zIndex: Math.min(76, z),
      rotateDeg:
        Math.round(rotateDegFor(it.p.slug, seq) * rotMul * 100) / 100,
      offsetXPx: ox,
      offsetYPx: oy,
    };
    seq++;
  }

  const medians = rest.map((m) => m.imp).sort((a, b) => a - b);
  const medImp =
    medians.length === 0 ? 0 : medians[Math.floor(medians.length / 2)] ?? 0;

  const fillOrder = orderForFill(
    rest.slice().sort((a, b) => compareFillPriority(a, b)),
  );
  const candidates = generateCandidates(n * 7 + 100);

  let fillI = 0;
  for (const it of fillOrder) {
    const impN = maxImp > 0 ? it.imp / maxImp : 0.5;
    let downNudge = 0;
    if (
      (it.layoutSize === "lg" || it.layoutSize === "xl") &&
      it.imp < medImp &&
      hash01(it.p.slug, 77) < 0.52
    ) {
      downNudge = 9 + hash01(it.p.slug, 88) * 10;
    }

    const isProm = prominent.has(it.idx);
    const promJitter =
      isProm && !heroIdx.has(it.idx)
        ? (hash01(it.p.slug, 44) - 0.5) * 7.2
        : 0;
    const vBreak =
      (hash01(it.p.slug, 12) - 0.5) * (5 + (1 - impN) * 10 + fillI * 0.06) +
      (isProm && !heroIdx.has(it.idx) ? (hash01(it.p.slug, 55) - 0.5) * 5 : 0);
    const idealTop =
      31 +
      Math.pow(1 - impN, 0.78) * 11 +
      (1 - Math.pow(impN, 1.05)) * 46 +
      downNudge +
      vBreak;
    const spread = 16 + (1 - impN) * 34;
    let idealLeft =
      50 +
      (hash01(it.p.slug, 10) - 0.5) * spread * 0.88 -
      (impN - 0.4) * 14 +
      (fillI % 5) * 0.6 +
      promJitter;
    idealLeft = nudgeLeftClusterTowardCenter(idealLeft);

    const zoneMul = sepMulForTop(idealTop);

    const ranked = candidates
      .map((c) => {
        const dx = (c.left - idealLeft) * 0.92;
        const dy = c.top - idealTop;
        return { c, d: dx * dx + dy * dy };
      })
      .sort((a, b) => a.d - b.d);

    let placedOne = false;
    for (const { c } of ranked) {
      let left = c.left + (hash01(it.p.slug, 20 + fillI) - 0.5) * 5.5;
      let top = c.top + (hash01(it.p.slug, 31 + fillI) - 0.5) * 6.2;

      left = clampWallLeftPct(left, it.layoutSize);
      top = Math.max(13.5, Math.min(81, top));

      const mul = sepMulForTop(top) * 0.98 + zoneMul * 0.02;

      if (minSepOk(left, top, it.layoutSize, placed, mul, isProm)) {
        placed.push({ left, top, size: it.layoutSize, prominent: isProm });
        const ox = handOffsetPx(it.p.slug, seq, 0);
        const oy = handOffsetPx(it.p.slug, seq, 1);
        const z =
          11 +
          Math.round(impN * 12) +
          (it.p.priority === "hero" ? 18 : it.p.priority === "large" ? 7 : 0) +
          (it.layoutSize === "sm" ? 0 : 1);

        out[it.idx] = {
          topPct: Math.round(top * 10) / 10,
          leftPct: Math.round(left * 10) / 10,
          width: widthForProjectSize(it.layoutSize),
          zIndex: Math.min(NON_PROM_Z_CAP, z + (top > 64 ? fillI % 3 : 0)),
          rotateDeg: Math.round(rotateDegFor(it.p.slug, seq) * 100) / 100,
          offsetXPx: ox,
          offsetYPx: oy,
        };
        seq++;
        fillI++;
        placedOne = true;
        break;
      }
    }

    if (!placedOne) {
      for (let jitter = 0; jitter < 55 && !placedOne; jitter++) {
        const ang = jitter * 1.31 + hash01(it.p.slug, 50) * 5.5;
        const rad = 7 + jitter * 0.62;
        let left = idealLeft + Math.cos(ang) * rad * 0.82;
        let top = idealTop + Math.sin(ang) * rad * 0.58;
        left = clampWallLeftPct(left, it.layoutSize);
        top = Math.max(13.5, Math.min(81, top));
        const mul = sepMulForTop(top);
        if (minSepOk(left, top, it.layoutSize, placed, mul, isProm)) {
          placed.push({ left, top, size: it.layoutSize, prominent: isProm });
          const ox = handOffsetPx(it.p.slug, seq, 0);
          const oy = handOffsetPx(it.p.slug, seq, 1);
          const z =
            10 +
            Math.round(impN * 10) +
            (it.p.priority === "hero" ? 16 : 0);

          out[it.idx] = {
            topPct: Math.round(top * 10) / 10,
            leftPct: Math.round(left * 10) / 10,
            width: widthForProjectSize(it.layoutSize),
            zIndex: Math.min(NON_PROM_Z_CAP, z),
            rotateDeg: Math.round(rotateDegFor(it.p.slug, seq) * 100) / 100,
            offsetXPx: ox,
            offsetYPx: oy,
          };
          seq++;
          fillI++;
          placedOne = true;
        }
      }
    }

    if (!placedOne) {
      let left = idealLeft;
      let top = idealTop;
      const mul = sepMulForTop(idealTop) * 0.55;
      for (let s = 0; s < 28; s++) {
        left += (hash01(it.p.slug, 60 + s) - 0.5) * 4.5;
        top += (hash01(it.p.slug, 90 + s) - 0.5) * 4.5;
        left = clampWallLeftPct(left, it.layoutSize);
        top = Math.max(13.5, Math.min(81, top));
        if (minSepOk(left, top, it.layoutSize, placed, mul, isProm)) break;
      }
      placed.push({ left, top, size: it.layoutSize, prominent: isProm });
      const ox = handOffsetPx(it.p.slug, seq, 0);
      const oy = handOffsetPx(it.p.slug, seq, 1);
      out[it.idx] = {
        topPct: Math.round(top * 10) / 10,
        leftPct: Math.round(left * 10) / 10,
        width: widthForProjectSize(it.layoutSize),
        zIndex: Math.min(NON_PROM_Z_CAP, 9 + fillI + (top > 62 ? 2 : 0)),
        rotateDeg: Math.round(rotateDegFor(it.p.slug, seq) * 100) / 100,
        offsetXPx: ox,
        offsetYPx: oy,
      };
      seq++;
      fillI++;
    }
  }

  for (let i = 0; i < n; i++) {
    if (!prominent.has(i)) continue;
    const cur = out[i]!;
    const slug = projects[i]!.slug;
    const ord = prominentOrder.get(i) ?? 0;
    const layerFlip = hash01(slug, 808) < 0.5 ? 0 : 1;
    out[i] = {
      ...cur,
      zIndex: (ord + layerFlip) % 2 === 0 ? PROM_Z_TOP : PROM_Z_SUB,
    };
  }

  for (let i = 0; i < n; i++) {
    if (prominent.has(i)) continue;
    const cur = out[i]!;
    if (cur.zIndex > NON_PROM_Z_CAP) {
      out[i] = { ...cur, zIndex: NON_PROM_Z_CAP };
    }
  }

  return out;
}

/** Newest-first for index rail and sheets (year desc, then catalog order). */
export function sortProjectsByYearDesc(projectList: Project[]): Project[] {
  return projectList
    .map((project, idx) => ({ project, idx }))
    .sort((a, b) => {
      const ay = parseInt(a.project.year, 10);
      const by = parseInt(b.project.year, 10);
      const aYear = Number.isFinite(ay) ? ay : -Infinity;
      const bYear = Number.isFinite(by) ? by : -Infinity;
      if (bYear !== aYear) return bYear - aYear;
      return a.idx - b.idx;
    })
    .map(({ project }) => project);
}
