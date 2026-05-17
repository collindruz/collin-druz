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
      return "clamp(81px, 12.2vw, 220px)";
    case "lg":
      return "clamp(74px, 10.35vw, 190px)";
    case "md":
      return "clamp(68px, 8.7vw, 164px)";
    case "sm":
      return "clamp(57px, 7.05vw, 137px)";
  }
}

const SIZE_SEP_PCT: Record<ProjectSize, number> = {
  xl: 12.7,
  lg: 11.25,
  md: 8.65,
  sm: 6.95,
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
  xl: 12.2 / 2,
  lg: 10.35 / 2,
  md: 8.7 / 2,
  sm: 7.05 / 2,
};

/** Clear band around fixed UI (name, email, index) — % of viewport. */
const UI_MARGIN_PCT = 5;

/**
 * Match desktop index rail: `right: ~1.35%`, panel `width: min(17vw, 248px)` — vw
 * term used here (cap omitted for static layout).
 */
const RAIL_RIGHT_MARGIN_PCT = 1.35;
const RAIL_PANEL_WIDTH_VW = 17;

const WALL_HAND_SLACK_PCT = 2.6;

/** Thumbnail reads soft at large scale — keep wall footprint small even if “prominent”. */
const WALL_COMPACT_THUMB_SLUGS = new Set<string>([
  "smirnoff-live-louder-karol-g",
]);

/** Newest-seven boost skipped — still on the wall, reads as catalogue not hero. */
const WALL_PROMINENCE_SKIP_SLUGS = new Set<string>(["doja-cat-gorgeous"]);

/** Name plate ~top-left + `UI_MARGIN_PCT` cushion (axis-aligned, top = 0). */
const NAME_EXCL_RIGHT = 17 + UI_MARGIN_PCT;
const NAME_EXCL_BOTTOM = 9 + UI_MARGIN_PCT;

/** Bottom-left email block: narrow band, only lower strip + `UI_MARGIN_PCT`. */
const EMAIL_EXCL_RIGHT = 24 + UI_MARGIN_PCT;
/** From top: 100 − bottom inset − copy block − margins (keeps rest of wall open). */
const EMAIL_EXCL_TOP =
  100 - UI_MARGIN_PCT - 4 - 11 - UI_MARGIN_PCT;

function railLeftEdgePct(): number {
  return 100 - RAIL_RIGHT_MARGIN_PCT - RAIL_PANEL_WIDTH_VW;
}

/** Left edge of index column minus the 5% comfort band — mural usable right bound. */
function muralContentRightPct(): number {
  return railLeftEdgePct() - UI_MARGIN_PCT;
}

function effectiveHalfWidthPct(size: ProjectSize): number {
  return HALF_WIDTH_VW[size] + WALL_HAND_SLACK_PCT;
}

/** Composition tier: 0 = hero constellation, 1 = mid support, 2 = small satellites (may bleed past mural band). */
type CompositionTier = 0 | 1 | 2;

function clampWallLeftPct(
  leftPct: number,
  size: ProjectSize,
  tier: CompositionTier = 1,
): number {
  const hw = effectiveHalfWidthPct(size);
  let minC = UI_MARGIN_PCT + hw;
  let maxC = muralContentRightPct() - hw;
  if (tier === 2) {
    minC -= 2.0;
    maxC += 1.85;
  }
  return Math.min(maxC, Math.max(minC, leftPct));
}

/** Horizontal center of the mural band (posters only), per footprint size. */
function wallContentMidpointPct(size: ProjectSize): number {
  const hw = effectiveHalfWidthPct(size);
  const minC = UI_MARGIN_PCT + hw;
  const maxC = muralContentRightPct() - hw;
  return (minC + maxC) / 2;
}

/** Hero / candidate coords were authored against viewport center 50%. */
const LAYOUT_LEGACY_VIEWPORT_CENTER = 50;

function shiftFromLegacyViewportCenter(leftPct: number): number {
  return leftPct + (wallContentMidpointPct("md") - LAYOUT_LEGACY_VIEWPORT_CENTER);
}

function nudgeLeftClusterTowardCenter(leftPct: number): number {
  const target = wallContentMidpointPct("md");
  if (leftPct >= target) return leftPct;
  return leftPct + (target - leftPct) * 0.58;
}

function posterBoundsPct(
  leftPct: number,
  topPct: number,
  size: ProjectSize,
): { l: number; r: number; t: number; b: number } {
  const hw = effectiveHalfWidthPct(size);
  const hh = hw * 1.25;
  return {
    l: leftPct - hw,
    r: leftPct + hw,
    t: topPct - hh,
    b: topPct + hh,
  };
}

function overlapsNamePlate(
  leftPct: number,
  topPct: number,
  size: ProjectSize,
): boolean {
  const box = posterBoundsPct(leftPct, topPct, size);
  return (
    box.l < NAME_EXCL_RIGHT &&
    box.r > 0.5 &&
    box.t < NAME_EXCL_BOTTOM &&
    box.b > 0.5
  );
}

function overlapsEmailPlate(
  leftPct: number,
  topPct: number,
  size: ProjectSize,
): boolean {
  const box = posterBoundsPct(leftPct, topPct, size);
  if (box.l >= EMAIL_EXCL_RIGHT) return false;
  return box.b > EMAIL_EXCL_TOP;
}

function overlapsIndexBand(
  leftPct: number,
  topPct: number,
  size: ProjectSize,
): boolean {
  const box = posterBoundsPct(leftPct, topPct, size);
  return box.r > muralContentRightPct();
}

/** Clear 5%-margin UI + neighbor separation. */
function finalizeWallPosition(
  leftPct: number,
  topPct: number,
  size: ProjectSize,
  placed: Placed[],
  sepMul: number,
  selfProminent: boolean,
  slug: string,
  topMin: number,
  topMax: number,
  compTier: CompositionTier,
): { left: number; top: number } {
  let L = leftPct;
  let T = topPct;
  let tries = 0;
  while (tries < 42) {
    const sepOk = minSepOk(L, T, size, placed, sepMul, selfProminent, compTier);
    const nameHit = overlapsNamePlate(L, T, size);
    const emailHit = overlapsEmailPlate(L, T, size);
    const indexHit = overlapsIndexBand(L, T, size);
    if (sepOk && !nameHit && !emailHit && !indexHit) break;

    if (!sepOk) {
      L += (hash01(slug, tries + 180) - 0.5) * 2.9;
      T += (hash01(slug, tries + 241) - 0.5) * 2.1;
    } else if (indexHit) {
      L -= 2.2;
      T += (hash01(slug, tries + 90) - 0.5) * 1.2;
    } else if (emailHit) {
      T -= 1.6;
      L += 1.3;
    } else if (nameHit) {
      L += 1.6;
      T += 0.7;
    }
    L = clampWallLeftPct(L, size, compTier);
    T = Math.max(topMin, Math.min(topMax, T));
    tries++;
  }
  return { left: L, top: T };
}

const MANDATORY_HERO_SLUGS = [
  "le-sserafim-easy",
  "sabrina-carpenter-taste",
  "lil-dicky-hahaha-i-love-myself",
  "charlie-puth-thats-not-how-this-works",
  "doja-cat-agora-hills",
] as const;

const MANDATORY_HERO_SLUG_SET = new Set<string>(MANDATORY_HERO_SLUGS);

const ANCHOR_SLOT_BY_SLUG: Record<string, { left: number; top: number }> = {
  "le-sserafim-easy": { left: 50.5, top: 17.0 },
  "sabrina-carpenter-taste": { left: 33.8, top: 22.6 },
  "lil-dicky-hahaha-i-love-myself": { left: 66.2, top: 20.4 },
  "charlie-puth-thats-not-how-this-works": { left: 45.0, top: 40.9 },
  "doja-cat-agora-hills": { left: 55.0, top: 36.9 },
};

/** Upper band vs. above-center mass — breaks “all heroes in one strip” reads. */
function heroTopBand(slug: string): { min: number; max: number } {
  if (
    slug === "charlie-puth-thats-not-how-this-works" ||
    slug === "doja-cat-agora-hills"
  ) {
    return { min: 31.5, max: 46.5 };
  }
  return { min: 14, max: 29.2 };
}

const HERO_OPTIONAL_SLOTS: Array<{ left: number; top: number }> = [
  { left: 26.8, top: 25.2 },
  { left: 72.6, top: 27.8 },
  { left: 40.2, top: 33.4 },
  { left: 62.8, top: 35.6 },
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
  if (WALL_COMPACT_THUMB_SLUGS.has(p.slug)) return p.size;
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

function rotTierMul(tier: CompositionTier): number {
  if (tier === 0) return 0.78;
  if (tier === 2) return 1.13;
  return 1;
}

const COMPOSITION_HERO_SLUGS = new Set<string>(MANDATORY_HERO_SLUGS);

/** Fill pass: hero slugs are never in `rest`, but keep tier consistent for any caller. */
function compositionTierForProject(p: Project): CompositionTier {
  if (COMPOSITION_HERO_SLUGS.has(p.slug)) return 0;
  if (p.size === "sm" || p.priority === "small") return 2;
  return 1;
}

function tierOverlapMul(a: CompositionTier, b: CompositionTier): number {
  if (a === 0 && b === 0) return 1.24;
  if (a === 2 && b === 2) return 0.74;
  if (a === 2 || b === 2) return 0.9;
  return 1;
}

/** Name plate + index rail — keep soft voids without hard grids. */
function breathingRepel(left: number, top: number, slug: string): { dl: number; dt: number } {
  if (hash01(slug, 999) < 0.2) return { dl: 0, dt: 0 };
  const pockets: Array<{ lx: number; ly: number; r: number; push: number }> = [
    { lx: 12.5, ly: 18.2, r: 10.8, push: 5.1 },
    { lx: 62.2, ly: 34.5, r: 10.2, push: 4.45 },
  ];
  let dl = 0;
  let dt = 0;
  for (const pocket of pockets) {
    const dx = left - pocket.lx;
    const dy = top - pocket.ly;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.02;
    if (d < pocket.r) {
      const w = (pocket.r - d) / pocket.r;
      dl += (dx / d) * pocket.push * w;
      dt += (dy / d) * pocket.push * w;
    }
  }
  return { dl, dt };
}

/** Subtle NW→SE drift so the read scans diagonally, not in bands. */
function diagonalFlowBias(slug: string, salt: number): { dl: number; dt: number } {
  const ray = hash01(slug, 602 + salt);
  const w = 0.6 + hash01(slug, 603 + salt) * 0.42;
  return {
    dl: (ray - 0.33) * 8.1 * w,
    dt: (ray - 0.27) * 6.4 * w,
  };
}

/** Pull mid-support (and weaker pull for satellites) toward the emotional center mass. */
function centerClusterPull(
  left: number,
  top: number,
  tier: CompositionTier,
  impN: number,
): { dl: number; dt: number } {
  const cx = wallContentMidpointPct("md") + 0.9;
  const cy = 41.6;
  if (tier === 2) {
    const pull = 0.055 + impN * 0.05;
    return {
      dl: (cx - left) * pull,
      dt: (cy - top) * pull * 0.85,
    };
  }
  const pull = 0.135 + impN * 0.14;
  return {
    dl: (cx - left) * pull,
    dt: (cy - top) * pull * 0.94,
  };
}

type Placed = {
  left: number;
  top: number;
  size: ProjectSize;
  prominent: boolean;
  compTier: CompositionTier;
};

function minSepOk(
  left: number,
  top: number,
  size: ProjectSize,
  placed: Placed[],
  sepMul = 1,
  selfProminent = false,
  selfTier: CompositionTier = 1,
): boolean {
  for (const q of placed) {
    let need = sepMin(size, q.size) * sepMul;
    if (q.prominent || selfProminent) need *= PROM_SEP_GUARD;
    need *= tierOverlapMul(selfTier, q.compTier);
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
  if (top < 72) return 0.61;
  return 0.57;
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

/** Interleave mid support + satellites with a hash-driven rhythm (not size-row patterns). */
function orderForFill(items: WallMeta[]): WallMeta[] {
  const t1 = items
    .filter((m) => compositionTierForProject(m.p) === 1)
    .sort(compareFillPriority);
  const t2 = items
    .filter((m) => compositionTierForProject(m.p) === 2)
    .sort(compareFillPriority);
  const out: WallMeta[] = [];
  let i1 = 0;
  let i2 = 0;
  let salt = 0;
  while (i1 < t1.length || i2 < t2.length) {
    const only2 = i1 >= t1.length;
    const only1 = i2 >= t2.length;
    let take2: boolean;
    if (only2) take2 = true;
    else if (only1) take2 = false;
    else {
      const h = hash01("organic-mix", salt);
      const debt = i2 * 1.22 - i1 * 0.44;
      take2 = h < 0.36 + Math.max(-0.14, Math.min(0.2, debt * 0.019));
      salt++;
    }
    if (take2) out.push(t2[i2++]!);
    else out.push(t1[i1++]!);
  }
  return out;
}

function generateCandidates(extra: number): Array<{ left: number; top: number }> {
  const out: Array<{ left: number; top: number }> = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  const total = Math.min(240, extra);
  const mid = wallContentMidpointPct("md");
  const spanLo = UI_MARGIN_PCT + 4;
  const spanHi = muralContentRightPct() - 4;

  for (let i = 0; i < total; i++) {
    const z = i / Math.max(total - 1, 1);
    const r = 2.8 + Math.sqrt(i + 1) * 5.65;
    const wobble = ((i * 7) % 11) * 0.041 + ((i * 5) % 13) * 0.019;
    const ang = i * golden + 0.52 + wobble;
    let left = mid + Math.cos(ang) * r * 0.88;
    let top = 37 + Math.sin(ang) * r * 0.66 + z * z * 11;

    left = left * 0.58 + (spanLo + z * (spanHi - spanLo)) * 0.42;
    top = Math.min(93, top * 0.49 + (25.5 + Math.pow(z, 0.72) * 59) * 0.51);

    if (i % 2 === 0) {
      left += (top - 44.5) * 0.1;
    }

    const m17 = i % 17;
    if (m17 === 5) left = spanLo + (i % 7) * 0.58 + (i % 3) * 0.22;
    else if (m17 === 12) left = spanHi - (i % 6) * 0.48 - (i % 4) * 0.16;

    const m23 = i % 23;
    if (m23 === 7) top = 16.2 + (i % 6) * 0.62;
    else if (m23 === 16) top = 77.5 + (i % 5) * 0.48;

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

/** Newest-seven boost: skip EP / catalogue-first slugs so the next items fill those slots. */
function buildProminentList(prelim: WallMeta[]): WallMeta[] {
  const ordered = prelim.slice().sort(compareNewestFirst);
  const out: WallMeta[] = [];
  for (const m of ordered) {
    if (out.length >= PROMINENT_RECENT_N) break;
    if (WALL_PROMINENCE_SKIP_SLUGS.has(m.p.slug)) continue;
    out.push(m);
  }
  return out;
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
  const prominentList = buildProminentList(prelim);
  const prominent = new Set(prominentList.map((m) => m.idx));
  const prominentOrder = new Map<number, number>();
  prominentList.forEach((m, k) => {
    prominentOrder.set(m.idx, k);
  });

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
    const band = heroTopBand(slug);
    const anchorBase = ANCHOR_SLOT_BY_SLUG[slug];
    let baseLeft: number;
    let baseTop: number;
    if (anchorBase) {
      baseLeft = shiftFromLegacyViewportCenter(anchorBase.left);
      baseTop = anchorBase.top;
    } else {
      const ex = HERO_OPTIONAL_SLOTS[optSlot++] ?? { left: 50, top: 27.5 };
      baseLeft = shiftFromLegacyViewportCenter(ex.left);
      baseTop = ex.top;
    }

    const isKeyAnchor = MANDATORY_HERO_SLUG_SET.has(slug);
    const jx = isKeyAnchor ? 2.25 : 3.6;
    const jy = isKeyAnchor ? 2.5 : 4.35;
    const rowBreaker = (hash01(slug, 17 + a) - 0.5) * (isKeyAnchor ? 3.4 : 4.8);

    let left =
      baseLeft +
      (hash01(slug, 2) - 0.5) * jx +
      (hash01(slug, 3) - 0.5) * (isKeyAnchor ? 1.15 : 2.25);
    let top =
      baseTop +
      rowBreaker +
      (hash01(slug, 1) - 0.5) * jy +
      (hash01(slug, 4) - 0.5) * (isKeyAnchor ? 1.35 : 2.35);

    const rn = maxImp > 0 ? it.imp / maxImp : 1;
    if (!isKeyAnchor) {
      left += (1 - rn) * 3.2;
      top -= rn * 1.6;
    }

    left = clampWallLeftPct(left, it.layoutSize, 0);
    top = Math.max(band.min, Math.min(band.max, top));

    const isProm = prominent.has(it.idx);
    if (isProm) {
      left += (hash01(slug, 71) - 0.5) * 2.9;
      top += (hash01(slug, 72) - 0.5) * 2.1;
      left = clampWallLeftPct(left, it.layoutSize, 0);
      top = Math.max(band.min, Math.min(band.max, top));
    }

    let tries = 0;
    while (
      tries < 40 &&
      !minSepOk(left, top, it.layoutSize, placed, heroSepMul, isProm, 0)
    ) {
      left += (hash01(slug, tries + 11) - 0.5) * 2.4;
      top += (hash01(slug, tries + 22) - 0.5) * 1.8;
      left = clampWallLeftPct(left, it.layoutSize, 0);
      top = Math.max(band.min, Math.min(band.max, top));
      tries++;
    }

    const fin = finalizeWallPosition(
      left,
      top,
      it.layoutSize,
      placed,
      heroSepMul,
      isProm,
      slug,
      band.min,
      band.max,
      0,
    );
    left = fin.left;
    top = fin.top;

    left = clampWallLeftPct(left, it.layoutSize, 0);
    placed.push({
      left,
      top,
      size: it.layoutSize,
      prominent: isProm,
      compTier: 0,
    });
    const offMul = isKeyAnchor ? 0.64 : 0.82;
    const ox = Math.round(handOffsetPx(it.p.slug, seq, 0) * offMul);
    const oy = Math.round(handOffsetPx(it.p.slug, seq, 1) * offMul);
    const z =
      24 +
      Math.round(rn * 10) +
      (it.p.priority === "hero" ? 24 : it.p.priority === "large" ? 12 : 0);

    const rotBase = isKeyAnchor ? 0.66 : 0.82;
    out[it.idx] = {
      topPct: Math.round(top * 10) / 10,
      leftPct: Math.round(left * 10) / 10,
      width: widthForProjectSize(it.layoutSize),
      zIndex: Math.min(76, z),
      rotateDeg:
        Math.round(
          rotateDegFor(it.p.slug, seq) * rotTierMul(0) * rotBase * 100,
        ) / 100,
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
  const fillN = Math.max(fillOrder.length - 1, 1);
  const candidates = generateCandidates(n * 7 + 100);

  let fillI = 0;
  for (const it of fillOrder) {
    const tier = compositionTierForProject(it.p);
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

    const gravTop = 39.1;
    const diagWave =
      (hash01(it.p.slug, 31 + fillI) - 0.5) * (13.2 + (1 - impN) * 10);
    const staggerY = (hash01(it.p.slug, 62) - 0.5) * (tier === 2 ? 16 : 10.5);
    const staggerX = (hash01(it.p.slug, 63) - 0.5) * (tier === 2 ? 11.2 : 8.2);
    const vBreak =
      (hash01(it.p.slug, 12) - 0.5) *
        (7 + (1 - impN) * 12 + hash01(it.p.slug, fillI + 400) * 5.1) +
      (isProm && !heroIdx.has(it.idx) ? (hash01(it.p.slug, 55) - 0.5) * 5.6 : 0);

    let idealTop =
      gravTop -
      Math.pow(impN, 0.88) * 16.8 +
      Math.pow(1 - impN, 0.82) * 22 +
      downNudge * 0.62 +
      vBreak +
      diagWave * 0.35 +
      staggerY;

    const spread = 15 + (1 - impN) * 33;
    const contentMidX = wallContentMidpointPct(it.layoutSize);
    let idealLeft =
      contentMidX +
      (hash01(it.p.slug, 10 + fillI) - 0.5) * spread * 0.94 -
      (impN - 0.38) * 13.2 +
      diagWave * 0.2 +
      staggerX +
      promJitter;

    idealLeft = nudgeLeftClusterTowardCenter(idealLeft);

    const magnet = centerClusterPull(idealLeft, idealTop, tier, impN);
    idealLeft += magnet.dl;
    idealTop += magnet.dt;

    const flow = diagonalFlowBias(it.p.slug, fillI);
    idealLeft += flow.dl;
    idealTop += flow.dt;

    if (tier === 1 && hash01(it.p.slug, 1200) < 0.45) {
      idealTop -= 5.8 + hash01(it.p.slug, 1201) * 7.2;
    }

    if (tier === 2) {
      idealTop +=
        (hash01(it.p.slug, 91) - 0.36) * 27 +
        (hash01(it.p.slug, 94) - 0.5) * 11;
    }

    idealTop += 3.5 * Math.pow(fillI / fillN, 1.08);
    idealTop += (hash01(it.p.slug, 515 + fillI) - 0.5) * 5.5;

    const breath = breathingRepel(idealLeft, idealTop, it.p.slug);
    idealLeft += breath.dl;
    idealTop += breath.dt;

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

      left = clampWallLeftPct(left, it.layoutSize, tier);
      top = Math.max(13.5, Math.min(92, top));

      const mul = sepMulForTop(top) * 0.98 + zoneMul * 0.02;

      if (minSepOk(left, top, it.layoutSize, placed, mul, isProm, tier)) {
        const fin = finalizeWallPosition(
          left,
          top,
          it.layoutSize,
          placed,
          mul,
          isProm,
          it.p.slug,
          13.5,
          92,
          tier,
        );
        left = fin.left;
        top = fin.top;
        if (!minSepOk(left, top, it.layoutSize, placed, mul, isProm, tier)) {
          continue;
        }
        placed.push({
          left,
          top,
          size: it.layoutSize,
          prominent: isProm,
          compTier: tier,
        });
        const ox = handOffsetPx(it.p.slug, seq, 0);
        const oy = handOffsetPx(it.p.slug, seq, 1);
        let z =
          11 +
          Math.round(impN * 11) +
          (it.p.priority === "hero" ? 18 : it.p.priority === "large" ? 7 : 0);
        if (tier === 2) z += Math.floor(hash01(it.p.slug, 707) * 3) - 1;
        else if (it.layoutSize !== "sm") z += 2;

        out[it.idx] = {
          topPct: Math.round(top * 10) / 10,
          leftPct: Math.round(left * 10) / 10,
          width: widthForProjectSize(it.layoutSize),
          zIndex: Math.min(NON_PROM_Z_CAP, z + (top > 64 ? fillI % 3 : 0)),
          rotateDeg:
            Math.round(rotateDegFor(it.p.slug, seq) * rotTierMul(tier) * 100) /
            100,
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
        left = clampWallLeftPct(left, it.layoutSize, tier);
        top = Math.max(13.5, Math.min(92, top));
        const mul = sepMulForTop(top);
        if (minSepOk(left, top, it.layoutSize, placed, mul, isProm, tier)) {
          const fin = finalizeWallPosition(
            left,
            top,
            it.layoutSize,
            placed,
            mul,
            isProm,
            it.p.slug,
            13.5,
            92,
            tier,
          );
          left = fin.left;
          top = fin.top;
          if (!minSepOk(left, top, it.layoutSize, placed, mul, isProm, tier)) {
            continue;
          }
          placed.push({
            left,
            top,
            size: it.layoutSize,
            prominent: isProm,
            compTier: tier,
          });
          const ox = handOffsetPx(it.p.slug, seq, 0);
          const oy = handOffsetPx(it.p.slug, seq, 1);
          let z =
            10 +
            Math.round(impN * 10) +
            (it.p.priority === "hero" ? 16 : 0);
          if (tier === 2) z += Math.floor(hash01(it.p.slug, 718) * 2) - 1;

          out[it.idx] = {
            topPct: Math.round(top * 10) / 10,
            leftPct: Math.round(left * 10) / 10,
            width: widthForProjectSize(it.layoutSize),
            zIndex: Math.min(NON_PROM_Z_CAP, z),
            rotateDeg:
              Math.round(rotateDegFor(it.p.slug, seq) * rotTierMul(tier) * 100) /
              100,
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
        left = clampWallLeftPct(left, it.layoutSize, tier);
        top = Math.max(13.5, Math.min(92, top));
        if (minSepOk(left, top, it.layoutSize, placed, mul, isProm, tier))
          break;
      }
      const finLast = finalizeWallPosition(
        left,
        top,
        it.layoutSize,
        placed,
        mul,
        isProm,
        it.p.slug,
        13.5,
        92,
        tier,
      );
      left = finLast.left;
      top = finLast.top;
      placed.push({
        left,
        top,
        size: it.layoutSize,
        prominent: isProm,
        compTier: tier,
      });
      const ox = handOffsetPx(it.p.slug, seq, 0);
      const oy = handOffsetPx(it.p.slug, seq, 1);
      out[it.idx] = {
        topPct: Math.round(top * 10) / 10,
        leftPct: Math.round(left * 10) / 10,
        width: widthForProjectSize(it.layoutSize),
        zIndex: Math.min(NON_PROM_Z_CAP, 9 + fillI + (top > 62 ? 2 : 0)),
        rotateDeg:
          Math.round(rotateDegFor(it.p.slug, seq) * rotTierMul(tier) * 100) /
          100,
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
