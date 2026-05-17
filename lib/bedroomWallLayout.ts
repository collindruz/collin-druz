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
      return "clamp(76px, 11.2vw, 202px)";
    case "lg":
      return "clamp(68px, 9.55vw, 175px)";
    case "md":
      return "clamp(63px, 8.05vw, 151px)";
    case "sm":
      return "clamp(52px, 6.5vw, 126px)";
  }
}

const SIZE_SEP_PCT: Record<ProjectSize, number> = {
  xl: 11.68,
  lg: 10.35,
  md: 7.96,
  sm: 6.4,
};

function sepMin(a: ProjectSize, b: ProjectSize): number {
  return (SIZE_SEP_PCT[a] + SIZE_SEP_PCT[b]) * 0.48;
}

const PR_RANK: Record<ProjectPriority, number> = {
  hero: 520_000,
  large: 135_000,
  standard: 28_000,
  small: 6_000,
};

const HALF_WIDTH_VW: Record<ProjectSize, number> = {
  xl: 11.2 / 2,
  lg: 9.55 / 2,
  md: 8.05 / 2,
  sm: 6.5 / 2,
};

const UI_MARGIN_PCT = 5;

const RAIL_RIGHT_MARGIN_PCT = 1.35;
const RAIL_PANEL_WIDTH_VW = 17;

const WALL_HAND_SLACK_PCT = 2.42;

const WALL_COMPACT_THUMB_SLUGS = new Set<string>([
  "smirnoff-live-louder-karol-g",
]);

const WALL_PROMINENCE_SKIP_SLUGS = new Set<string>(["doja-cat-gorgeous"]);

/** Scoring + headline membership — includes LE SSERAFIM as strong commercial pin. */
const HEADLINE_ANCHOR_SLUGS = [
  "le-sserafim-easy",
  "sabrina-carpenter-taste",
  "lil-dicky-hahaha-i-love-myself",
  "charlie-puth-thats-not-how-this-works",
  "doja-cat-agora-hills",
] as const;

const HEADLINE_ANCHOR_SET = new Set<string>(HEADLINE_ANCHOR_SLUGS);

/**
 * Physical pin order on the board: left → center → right (film-prep read).
 * Back-row wings + mid-register cinematic anchors; not a vertical stack.
 */
const HERO_PIN_ORDER = [
  "sabrina-carpenter-taste",
  "charlie-puth-thats-not-how-this-works",
  "doja-cat-agora-hills",
  "lil-dicky-hahaha-i-love-myself",
  "le-sserafim-easy",
] as const;

const LAYOUT_LEGACY_VIEWPORT_CENTER = 50;

const NAME_EXCL_RIGHT = 18.5 + UI_MARGIN_PCT;
const NAME_EXCL_BOTTOM = 10.5 + UI_MARGIN_PCT;
const EMAIL_EXCL_RIGHT = 24 + UI_MARGIN_PCT;
const EMAIL_EXCL_TOP =
  100 - UI_MARGIN_PCT - 4 - 11 - UI_MARGIN_PCT;

function railLeftEdgePct(): number {
  return 100 - RAIL_RIGHT_MARGIN_PCT - RAIL_PANEL_WIDTH_VW;
}

function muralContentRightPct(): number {
  return railLeftEdgePct() - UI_MARGIN_PCT - 0.28;
}

function effectiveHalfWidthPct(size: ProjectSize): number {
  return HALF_WIDTH_VW[size] + WALL_HAND_SLACK_PCT;
}

type WallRole = "headline" | "support" | "texture";

function clampWallLeftPct(
  leftPct: number,
  size: ProjectSize,
  role: WallRole,
): number {
  const hw = effectiveHalfWidthPct(size);
  let minC = UI_MARGIN_PCT + hw;
  let maxC = muralContentRightPct() - hw;
  if (role === "texture") {
    minC -= 2.6;
    maxC += 1.65;
  }
  return Math.min(maxC, Math.max(minC, leftPct));
}

function wallContentMidpointPct(size: ProjectSize): number {
  const hw = effectiveHalfWidthPct(size);
  const minC = UI_MARGIN_PCT + hw;
  const maxC = muralContentRightPct() - hw;
  return (minC + maxC) / 2;
}

function shiftFromLegacyViewportCenter(leftPct: number): number {
  return leftPct + (wallContentMidpointPct("md") - LAYOUT_LEGACY_VIEWPORT_CENTER);
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

const SIZE_RANK: Record<ProjectSize, number> = { sm: 0, md: 1, lg: 2, xl: 3 };
const RANK_TO_SIZE: ProjectSize[] = ["sm", "md", "lg", "xl"];

function bumpSize(size: ProjectSize, delta: number): ProjectSize {
  return RANK_TO_SIZE[Math.min(3, Math.max(0, SIZE_RANK[size] + delta))]!;
}

function yearNum(p: Project): number {
  const y = parseInt(p.year, 10);
  return Number.isFinite(y) ? y : -10_000;
}

function wallPlacementScore(idx: number, p: Project): number {
  let s = yearNum(p) * 800_000;
  s += 2_000 - Math.min(idx, 1_999);
  s += PR_RANK[p.priority];
  if (p.featured) s += 90_000;
  if (p.category === "Commercials") s += 220_000;
  if (p.category === "Narrative" && p.priority === "hero") s += 45_000;
  const sz = { xl: 18_000, lg: 11_000, md: 4_000, sm: 0 };
  s += sz[p.size];
  if (HEADLINE_ANCHOR_SET.has(p.slug)) s += 1_200_000;
  if (WALL_PROMINENCE_SKIP_SLUGS.has(p.slug)) s -= 950_000;
  return s;
}

function hash01(slug: string, salt: number): number {
  let h = salt * 374761393;
  for (let i = 0; i < slug.length; i++) {
    h = (h + slug.charCodeAt(i) * (i + 97)) >>> 0;
  }
  return (((h % 10_000) + 10_000) % 10_000) / 10_000;
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

/** Straighter “taped” heroes; a touch more skew on scraps. */
function rotateDegFor(slug: string, k: number, role: WallRole): number {
  let h = k * 2654435761;
  for (let i = 0; i < slug.length; i++) {
    h = (h + slug.charCodeAt(i) * (i + 3)) >>> 0;
  }
  const t = (h % 1000) / 1000;
  const base = -2 + t * 4;
  const mul =
    role === "headline" ? 0.52 : role === "support" ? 0.82 : 1.02;
  return base * mul;
}

/**
 * Landscape board pins — spread across width; two loose registers (back / mid).
 * Coordinates are legacy-centered; shiftFromLegacyViewportCenter applied when placing.
 */
const ANCHOR_BY_SLUG: Record<string, { left: number; top: number }> = {
  "sabrina-carpenter-taste": { left: 23.7, top: 21.8 },
  "charlie-puth-thats-not-how-this-works": { left: 35.1, top: 37.9 },
  "doja-cat-agora-hills": { left: 51.1, top: 34.6 },
  "lil-dicky-hahaha-i-love-myself": { left: 63.4, top: 22 },
  "le-sserafim-easy": { left: 75.8, top: 19.4 },
};

function anchorBand(slug: string): { min: number; max: number } {
  if (
    slug === "charlie-puth-thats-not-how-this-works" ||
    slug === "doja-cat-agora-hills"
  ) {
    return { min: 31.5, max: 45 };
  }
  return { min: 16.5, max: 29.5 };
}

/** Second row — wider footprint; uneven tops for hand-placed rhythm. */
const EXTRA_PIN_ROW: Array<{ left: number; top: number }> = [
  { left: 27.6, top: 30.2 },
  { left: 39.5, top: 28.1 },
  { left: 54.6, top: 30 },
  { left: 67.6, top: 28.6 },
  { left: 33.4, top: 34 },
  { left: 46.8, top: 32.6 },
  { left: 60.6, top: 33.5 },
  { left: 72.5, top: 31.1 },
  { left: 41.1, top: 36.2 },
  { left: 57.6, top: 35.2 },
];

type Placed = {
  left: number;
  top: number;
  size: ProjectSize;
  role: WallRole;
  slug: string;
};

/** Physical stacking — refined: ~12% more air; heroes stay readable; scraps don’t bury pins. */
function roleSepMul(a: WallRole, b: WallRole): number {
  if (a === "headline" && b === "headline") return 1.69;
  if (
    (a === "support" && b === "headline") ||
    (a === "headline" && b === "support")
  ) {
    return 0.98;
  }
  if (a === "texture" && b === "texture") return 0.74;
  if (a === "texture" || b === "texture") return 0.87;
  return 1.05;
}

function minSepOk(
  left: number,
  top: number,
  size: ProjectSize,
  placed: Placed[],
  sepMul: number,
  role: WallRole,
): boolean {
  for (const q of placed) {
    let need = sepMin(size, q.size) * sepMul;
    need *= roleSepMul(role, q.role);
    const dx = (left - q.left) * 0.935;
    const dy = top - q.top;
    if (dx * dx + dy * dy < need * need) return false;
  }
  return true;
}

function finalizeWallPosition(
  leftPct: number,
  topPct: number,
  size: ProjectSize,
  placed: Placed[],
  sepMul: number,
  role: WallRole,
  slug: string,
  topMin: number,
  topMax: number,
): { left: number; top: number } {
  let L = leftPct;
  let T = topPct;
  let tries = 0;
  while (tries < 48) {
    const ok =
      minSepOk(L, T, size, placed, sepMul, role) &&
      !overlapsNamePlate(L, T, size) &&
      !overlapsEmailPlate(L, T, size) &&
      !overlapsIndexBand(L, T, size);
    if (ok) break;

    if (!minSepOk(L, T, size, placed, sepMul, role)) {
      L += (hash01(slug, tries + 180) - 0.5) * 3.1;
      T += (hash01(slug, tries + 241) - 0.5) * 2.2;
    } else if (overlapsIndexBand(L, T, size)) {
      L -= 3.05;
      T += (hash01(slug, tries + 90) - 0.5) * 1.3;
    } else if (overlapsEmailPlate(L, T, size)) {
      T -= 1.8;
      L += 1.1;
    } else if (overlapsNamePlate(L, T, size)) {
      L += 1.85;
      T += 0.75;
    }
    L = clampWallLeftPct(L, size, role);
    T = Math.max(topMin, Math.min(topMax, T));
    tries++;
  }
  return { left: L, top: T };
}

/** Asymmetric voids — name + index; lighter center-right pocket so mass isn’t a blob. */
function boardBreathing(left: number, top: number, slug: string): { dl: number; dt: number } {
  if (hash01(slug, 988) < 0.16) return { dl: 0, dt: 0 };
  const pockets = [
    { lx: 11.8, ly: 17, r: 11, push: 5 },
    { lx: 63, ly: 40, r: 9, push: 2.15 },
  ];
  let dl = 0;
  let dt = 0;
  for (const p of pockets) {
    const dx = left - p.lx;
    const dy = top - p.ly;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.02;
    if (d < p.r) {
      const w = (p.r - d) / p.r;
      dl += (dx / d) * p.push * w;
      dt += (dy / d) * p.push * w;
    }
  }
  return { dl, dt };
}

/** Tiny L→R drift only — not a diagonal “algorithm” sweep. */
function manualSkew(slug: string, salt: number): { dl: number; dt: number } {
  const u = hash01(slug, 710 + salt);
  const v = hash01(slug, 711 + salt);
  const w = 0.72 + hash01(slug, 712 + salt) * 0.55;
  return {
    dl: (u - 0.5) * 4.8 * w,
    dt: (v - 0.5) * 3.9 * w,
  };
}

type WallMeta = {
  idx: number;
  p: Project;
  score: number;
  layoutSize: ProjectSize;
  role: WallRole;
};

export function sortProjectsByYearDesc(projectList: Project[]): Project[] {
  return projectList
    .map((project, idx) => ({ project, idx }))
    .sort((a, b) => {
      const ya = yearNum(a.project);
      const yb = yearNum(b.project);
      if (yb !== ya) return yb - ya;
      const sa = wallPlacementScore(a.idx, a.project);
      const sb = wallPlacementScore(b.idx, b.project);
      if (sb !== sa) return sb - sa;
      return a.idx - b.idx;
    })
    .map(({ project }) => project);
}

export function computeWallLayouts(projects: Project[]): PosterWallLayout[] {
  const n = projects.length;
  if (n === 0) return [];

  const scored = projects.map((p, idx) => ({
    idx,
    p,
    score: wallPlacementScore(idx, p),
  }));
  const byScoreDesc = scored.slice().sort((a, b) => b.score - a.score);

  const headlineTarget = Math.min(
    14,
    Math.max(7, Math.ceil(n * 0.13)),
  );
  const headlineIdx = new Set<number>();
  for (const slug of HEADLINE_ANCHOR_SLUGS) {
    const found = scored.find((x) => x.p.slug === slug);
    if (found) headlineIdx.add(found.idx);
  }
  for (const row of byScoreDesc) {
    if (headlineIdx.size >= headlineTarget) break;
    headlineIdx.add(row.idx);
  }

  const textureCut = byScoreDesc[Math.floor(n * 0.48)]?.score ?? -Infinity;
  const isTexture = (idx: number) => {
    const row = scored.find((x) => x.idx === idx)!;
    return !headlineIdx.has(idx) && row.score < textureCut;
  };

  const metas: WallMeta[] = projects.map((p, idx) => {
    const score = wallPlacementScore(idx, p);
    const headline = headlineIdx.has(idx);
    const texture = !headline && isTexture(idx);
    const role: WallRole = headline ? "headline" : texture ? "texture" : "support";

    let layoutSize = p.size;
    if (WALL_COMPACT_THUMB_SLUGS.has(p.slug)) {
      layoutSize = p.size;
    } else if (role === "headline") {
      const rank = byScoreDesc.findIndex((x) => x.idx === idx);
      const boost = rank < 6 ? 2 : rank < 11 ? 1 : 0;
      layoutSize = bumpSize(p.size, boost);
    } else if (role === "texture") {
      layoutSize = bumpSize(p.size, -1);
    } else {
      layoutSize = bumpSize(p.size, p.priority === "small" ? -1 : 0);
    }

    return { idx, p, score, layoutSize, role };
  });

  const byIdx = new Map(metas.map((m) => [m.idx, m]));
  const placed: Placed[] = [];
  const out: PosterWallLayout[] = new Array(n);
  let seq = 0;

  const headlineMetas = metas.filter((m) => m.role === "headline");
  headlineMetas.sort((a, b) => b.score - a.score);

  let extraRowK = 0;

  const placeHeadline = (
    m: WallMeta,
    baseLeft: number,
    baseTop: number,
    band: { min: number; max: number },
  ) => {
    const slug = m.p.slug;
    const sepMul = 1.9;
    let left =
      baseLeft +
      (hash01(slug, 2) - 0.5) * 3.15 +
      (hash01(slug, 3) - 0.5) * 1.75 +
      (hash01(slug, 997) - 0.5) * 1.15;
    let top =
      baseTop +
      (hash01(slug, 1) - 0.5) * 2.55 +
      (hash01(slug, 4) - 0.5) * 2.05 +
      (hash01(slug, 998) - 0.5) * 0.9;

    left = clampWallLeftPct(left, m.layoutSize, "headline");
    top = Math.max(band.min, Math.min(band.max, top));

    for (
      let t = 0;
      t < 44 && !minSepOk(left, top, m.layoutSize, placed, sepMul, "headline");
      t++
    ) {
      left += (hash01(slug, t + 20) - 0.5) * 2.5;
      top += (hash01(slug, t + 50) - 0.5) * 1.8;
      left = clampWallLeftPct(left, m.layoutSize, "headline");
      top = Math.max(band.min, Math.min(band.max, top));
    }

    const fin = finalizeWallPosition(
      left,
      top,
      m.layoutSize,
      placed,
      sepMul,
      "headline",
      slug,
      band.min,
      band.max,
    );
    left = fin.left;
    top = fin.top;
    left = clampWallLeftPct(left, m.layoutSize, "headline");

    placed.push({ left, top, size: m.layoutSize, role: "headline", slug });
    const rankH = headlineMetas.findIndex((h) => h.idx === m.idx);
    const zBase = 66 + Math.max(0, 14 - rankH) * 1.12;
    out[m.idx] = {
      topPct: Math.round(top * 10) / 10,
      leftPct: Math.round(left * 10) / 10,
      width: widthForProjectSize(m.layoutSize),
      zIndex: Math.min(80, Math.round(zBase + hash01(slug, 505) * 3)),
      rotateDeg: Math.round(rotateDegFor(slug, seq, "headline") * 100) / 100,
      offsetXPx: Math.round(handOffsetPx(slug, seq, 0) * 0.72),
      offsetYPx: Math.round(handOffsetPx(slug, seq, 1) * 0.72),
    };
    seq++;
  };

  for (const slug of HERO_PIN_ORDER) {
    const m = metas.find((x) => x.p.slug === slug && x.role === "headline");
    if (!m) continue;
    const raw = ANCHOR_BY_SLUG[slug];
    if (!raw) continue;
    const band = anchorBand(slug);
    placeHeadline(
      m,
      shiftFromLegacyViewportCenter(raw.left),
      raw.top,
      band,
    );
  }

  for (const m of headlineMetas) {
    if (ANCHOR_BY_SLUG[m.p.slug]) continue;
    const slot = EXTRA_PIN_ROW[extraRowK % EXTRA_PIN_ROW.length]!;
    extraRowK++;
    const jittered = {
      left: shiftFromLegacyViewportCenter(
        slot.left + (hash01(m.p.slug, 820) - 0.5) * 5.2,
      ),
      top: slot.top + (hash01(m.p.slug, 821) - 0.5) * 3.6,
    };
    placeHeadline(m, jittered.left, jittered.top, { min: 25.5, max: 41 });
  }

  const supportList = metas.filter((m) => m.role === "support");
  supportList.sort((a, b) => b.score - a.score);

  const textureList = metas.filter((m) => m.role === "texture");
  textureList.sort(
    (a, b) => hash01(a.p.slug, 777) - hash01(b.p.slug, 888),
  );

  const hwPad = (sz: ProjectSize) => effectiveHalfWidthPct(sz);
  const supportN = Math.max(supportList.length - 1, 1);
  let sI = 0;
  for (const m of supportList) {
    const slug = m.p.slug;
    const t = sI / supportN;
    const lo = UI_MARGIN_PCT + hwPad(m.layoutSize) * 0.22;
    const hi = muralContentRightPct() - 5.75;
    let idealLeft =
      lo +
      t * (hi - lo) * 0.995 +
      (t - 0.5) * 5.4 +
      Math.sin(t * Math.PI) * 5.5 +
      (hash01(slug, 301 + sI) - 0.5) * 9.5 +
      (hash01(slug, 304 + sI) - 0.5) * 2.35;
    const edgeDrift = (hash01(slug, 307 + sI) - 0.5) * 6.2;
    const edgeBand = hash01(slug, 308 + sI);
    const edgeKick =
      edgeBand < 0.38 ? -0.85 : edgeBand > 0.62 ? 0.82 : 0.15;
    let idealTop =
      39.2 +
      Math.sin(t * Math.PI * 2.1 + hash01(slug, 303) * 2) * 8.25 +
      (1 - Math.abs(t - 0.48)) * 3.35 -
      (hash01(slug, 302 + sI) - 0.5) * 5.6 +
      edgeDrift * edgeKick;

    const skew = manualSkew(slug, sI);
    idealLeft += skew.dl * 0.63;
    idealTop += skew.dt * 0.63;
    const br = boardBreathing(idealLeft, idealTop, slug);
    idealLeft += br.dl * 0.85;
    idealTop += br.dt * 0.85;

    idealLeft -= Math.max(0, idealLeft - (muralContentRightPct() - 15.1)) * 0.4;
    idealLeft = clampWallLeftPct(idealLeft, m.layoutSize, "support");
    idealTop = Math.max(35.5, Math.min(59, idealTop));

    const sepMul = 1.02 + (1 - t) * 0.2;
    let placedOne = false;
    for (let attempt = 0; attempt < 76 && !placedOne; attempt++) {
      let left =
        idealLeft +
        (hash01(slug, 400 + attempt) - 0.5) * (8.5 + attempt * 0.07);
      let top =
        idealTop +
        (hash01(slug, 500 + attempt) - 0.5) * (7 + attempt * 0.06);
      left = clampWallLeftPct(left, m.layoutSize, "support");
      top = Math.max(34, Math.min(60, top));
      if (!minSepOk(left, top, m.layoutSize, placed, sepMul, "support"))
        continue;
      const fin = finalizeWallPosition(
        left,
        top,
        m.layoutSize,
        placed,
        sepMul,
        "support",
        slug,
        34,
        61,
      );
      left = fin.left;
      top = fin.top;
      if (!minSepOk(left, top, m.layoutSize, placed, sepMul * 0.9, "support"))
        continue;
      placed.push({ left, top, size: m.layoutSize, role: "support", slug });
      const z =
        26 +
        Math.round((1 - t) * 14) +
        Math.round(hash01(slug, 606) * 4);
      out[m.idx] = {
        topPct: Math.round(top * 10) / 10,
        leftPct: Math.round(left * 10) / 10,
        width: widthForProjectSize(m.layoutSize),
        zIndex: Math.min(52, z),
        rotateDeg: Math.round(rotateDegFor(slug, seq, "support") * 100) / 100,
        offsetXPx: handOffsetPx(slug, seq, 0),
        offsetYPx: handOffsetPx(slug, seq, 1),
      };
      seq++;
      sI++;
      placedOne = true;
    }
    if (!placedOne) {
      let left = idealLeft;
      let top = idealTop;
      const mul = 0.64;
      for (let s = 0; s < 38; s++) {
        left += (hash01(slug, 700 + s) - 0.5) * 3.8;
        top += (hash01(slug, 750 + s) - 0.5) * 3.8;
        left = clampWallLeftPct(left, m.layoutSize, "support");
        top = Math.max(34, Math.min(61, top));
        if (minSepOk(left, top, m.layoutSize, placed, mul, "support")) break;
      }
      const fin = finalizeWallPosition(
        left,
        top,
        m.layoutSize,
        placed,
        mul,
        "support",
        slug,
        34,
        61,
      );
      placed.push({
        left: fin.left,
        top: fin.top,
        size: m.layoutSize,
        role: "support",
        slug,
      });
      out[m.idx] = {
        topPct: Math.round(fin.top * 10) / 10,
        leftPct: Math.round(fin.left * 10) / 10,
        width: widthForProjectSize(m.layoutSize),
        zIndex: 28,
        rotateDeg: Math.round(rotateDegFor(slug, seq, "support") * 100) / 100,
        offsetXPx: handOffsetPx(slug, seq, 0),
        offsetYPx: handOffsetPx(slug, seq, 1),
      };
      seq++;
      sI++;
    }
  }

  let texI = 0;
  for (const m of textureList) {
    const slug = m.p.slug;
    const roll = hash01(slug, 900 + texI);
    let idealLeft: number;
    let idealTop: number;

    if (roll < 0.3) {
      idealTop = 13.8 + hash01(slug, 901) * 10;
      idealLeft =
        UI_MARGIN_PCT +
        4.5 +
        hash01(slug, 902) * (muralContentRightPct() * 0.46);
    } else if (roll > 0.7) {
      idealTop = 62 + hash01(slug, 903) * 24;
      idealLeft =
        UI_MARGIN_PCT +
        hash01(slug, 904) * (muralContentRightPct() - 16.4);
    } else if (roll < 0.49) {
      idealLeft = UI_MARGIN_PCT + 3 + hash01(slug, 905) * 13;
      idealTop =
        hash01(slug, 906) < 0.42
          ? 16 + hash01(slug, 909) * 15
          : 58 + hash01(slug, 930) * 26;
    } else {
      idealLeft =
        muralContentRightPct() - 15.1 - hash01(slug, 907) * 15;
      idealTop =
        hash01(slug, 908) < 0.42
          ? 15 + hash01(slug, 911) * 14
          : 57 + hash01(slug, 931) * 27;
    }

    const skew = manualSkew(slug, texI + 2000);
    idealLeft += skew.dl * 0.52;
    idealTop += skew.dt * 0.52;
    const br = boardBreathing(idealLeft, idealTop, slug);
    idealLeft += br.dl * 0.7;
    idealTop += br.dt * 0.7;
    idealLeft = clampWallLeftPct(idealLeft, m.layoutSize, "texture");
    idealTop = Math.max(11, Math.min(90, idealTop));

    const sepMul = 0.63;
    let placedOne = false;
    for (let attempt = 0; attempt < 82 && !placedOne; attempt++) {
      let left =
        idealLeft +
        (hash01(slug, 910 + attempt) - 0.5) * (10 + attempt * 0.045);
      let top =
        idealTop +
        (hash01(slug, 960 + attempt) - 0.5) * (11 + attempt * 0.045);
      left = clampWallLeftPct(left, m.layoutSize, "texture");
      top = Math.max(10, Math.min(92, top));
      if (!minSepOk(left, top, m.layoutSize, placed, sepMul, "texture"))
        continue;
      const fin = finalizeWallPosition(
        left,
        top,
        m.layoutSize,
        placed,
        sepMul,
        "texture",
        slug,
        10,
        92,
      );
      left = fin.left;
      top = fin.top;
      if (!minSepOk(left, top, m.layoutSize, placed, sepMul * 0.86, "texture"))
        continue;
      placed.push({ left, top, size: m.layoutSize, role: "texture", slug });
      out[m.idx] = {
        topPct: Math.round(top * 10) / 10,
        leftPct: Math.round(left * 10) / 10,
        width: widthForProjectSize(m.layoutSize),
        zIndex: 12 + (texI % 5) + Math.round(hash01(slug, 999) * 6),
        rotateDeg: Math.round(rotateDegFor(slug, seq, "texture") * 100) / 100,
        offsetXPx: handOffsetPx(slug, seq, 0),
        offsetYPx: handOffsetPx(slug, seq, 1),
      };
      seq++;
      texI++;
      placedOne = true;
    }
    if (!placedOne) {
      placed.push({
        left: idealLeft,
        top: idealTop,
        size: m.layoutSize,
        role: "texture",
        slug,
      });
      out[m.idx] = {
        topPct: Math.round(idealTop * 10) / 10,
        leftPct: Math.round(idealLeft * 10) / 10,
        width: widthForProjectSize(m.layoutSize),
        zIndex: 11,
        rotateDeg: Math.round(rotateDegFor(slug, seq, "texture") * 100) / 100,
        offsetXPx: handOffsetPx(slug, seq, 0),
        offsetYPx: handOffsetPx(slug, seq, 1),
      };
      seq++;
      texI++;
    }
  }

  for (let i = 0; i < n; i++) {
    if (!out[i]) {
      const m = byIdx.get(i)!;
      out[i] = {
        topPct: 46,
        leftPct: wallContentMidpointPct(m.layoutSize),
        width: widthForProjectSize(m.layoutSize),
        zIndex: 20,
        rotateDeg: 0,
        offsetXPx: 0,
        offsetYPx: 0,
      };
    }
  }

  return out;
}
