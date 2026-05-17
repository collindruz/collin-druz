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
      return "clamp(78px, 11.4vw, 206px)";
    case "lg":
      return "clamp(70px, 9.75vw, 178px)";
    case "md":
      return "clamp(66px, 8.55vw, 158px)";
    case "sm":
      return "clamp(58px, 7.35vw, 142px)";
  }
}

const SIZE_SEP_PCT: Record<ProjectSize, number> = {
  xl: 11.85,
  lg: 10.5,
  md: 8.45,
  sm: 7.15,
};

function sepMin(a: ProjectSize, b: ProjectSize): number {
  return (SIZE_SEP_PCT[a] + SIZE_SEP_PCT[b]) * 0.568;
}

const PR_RANK: Record<ProjectPriority, number> = {
  hero: 520_000,
  large: 135_000,
  standard: 28_000,
  small: 6_000,
};

const HALF_WIDTH_VW: Record<ProjectSize, number> = {
  xl: 11.4 / 2,
  lg: 9.75 / 2,
  md: 8.55 / 2,
  sm: 7.35 / 2,
};

/** Minimal horizontal inset from viewport; posters use almost full width to the rail. */
const BOARD_PAD_X = 1.35;

/** Dev-only: set `NEXT_PUBLIC_DEBUG_WALL_LAYOUT=1` with `next dev`. Never affects production builds. */
export const DEBUG_WALL_LAYOUT =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEBUG_WALL_LAYOUT === "1";

const RAIL_RIGHT_MARGIN_PCT = 1.35;
const RAIL_PANEL_WIDTH_VW = 17;
/** Tiny gap only — board extends almost to the index rail. */
const RAIL_INNER_GAP_PCT = 0.32;

const WALL_HAND_SLACK_PCT = 2.05;

const WALL_COMPACT_THUMB_SLUGS = new Set<string>([
  "smirnoff-live-louder-karol-g",
]);

const WALL_PROMINENCE_SKIP_SLUGS = new Set<string>(["doja-cat-gorgeous"]);

const HEADLINE_ANCHOR_SLUGS = [
  "le-sserafim-easy",
  "sabrina-carpenter-taste",
  "lil-dicky-hahaha-i-love-myself",
  "charlie-puth-thats-not-how-this-works",
  "doja-cat-agora-hills",
] as const;

const HEADLINE_ANCHOR_SET = new Set<string>(HEADLINE_ANCHOR_SLUGS);

/** Hero priority → grid cell (col 0–4, row 0–3). Top + center rows anchor the board. */
const HERO_GRID_CELL: Record<string, { c: number; r: number }> = {
  "doja-cat-agora-hills": { c: 2, r: 0 },
  "sabrina-carpenter-taste": { c: 0, r: 0 },
  "lil-dicky-hahaha-i-love-myself": { c: 4, r: 0 },
  "charlie-puth-thats-not-how-this-works": { c: 1, r: 1 },
  "le-sserafim-easy": { c: 3, r: 1 },
};

const PRIORITY_HERO_ORDER = [
  "doja-cat-agora-hills",
  "sabrina-carpenter-taste",
  "lil-dicky-hahaha-i-love-myself",
  "charlie-puth-thats-not-how-this-works",
  "le-sserafim-easy",
] as const;

/** Landscape loose grid: 5×4 hand-taped cells. */
const GRID_COLS = 5;
const GRID_ROWS = 4;

const NAME_EXCL_RIGHT = 20;
const NAME_EXCL_BOTTOM = 16;
const EMAIL_EXCL_RIGHT = 22;
const EMAIL_EXCL_TOP = 100 - BOARD_PAD_X - 4 - 11 - BOARD_PAD_X;

function railLeftEdgePct(): number {
  return 100 - RAIL_RIGHT_MARGIN_PCT - RAIL_PANEL_WIDTH_VW;
}

function muralContentRightPct(): number {
  return railLeftEdgePct() - RAIL_INNER_GAP_PCT;
}

function effectiveHalfWidthPct(size: ProjectSize): number {
  return HALF_WIDTH_VW[size] + WALL_HAND_SLACK_PCT;
}

export type WallRole = "headline" | "support" | "texture";

type Placed = {
  left: number;
  top: number;
  size: ProjectSize;
  role: WallRole;
  slug: string;
};

function clampWallLeftPct(
  leftPct: number,
  size: ProjectSize,
  role: WallRole,
): number {
  const hw = effectiveHalfWidthPct(size);
  let minC = BOARD_PAD_X + hw;
  let maxC = muralContentRightPct() - hw;
  if (role === "texture") {
    minC -= 1.8;
    maxC += 1.1;
  }
  return Math.min(maxC, Math.max(minC, leftPct));
}

function wallContentMidpointPct(size: ProjectSize): number {
  const hw = effectiveHalfWidthPct(size);
  const minC = BOARD_PAD_X + hw;
  const maxC = muralContentRightPct() - hw;
  return (minC + maxC) / 2;
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
  const mag = 8 + (h % 9);
  const sign = (h >>> 5) & 1 ? 1 : -1;
  return sign * mag;
}

/** Middle third of the board (matches debug “C” band) — extra spacing + density rules here only. */
function centerTerritoryXBounds(ex: ReturnType<typeof gridExtents>): {
  lo: number;
  hi: number;
} {
  const w = ex.leftMax - ex.leftMin;
  return {
    lo: ex.leftMin + w / 3,
    hi: ex.leftMin + (2 * w) / 3,
  };
}

function inCenterTerritory(leftPct: number, ex: ReturnType<typeof gridExtents>): boolean {
  const { lo, hi } = centerTerritoryXBounds(ex);
  return leftPct >= lo && leftPct <= hi;
}

/** Hotspot radius (debug + light density check). */
const LOCAL_HOTSPOT_R = 10.2;
const LOCAL_HOTSPOT_R_CENTER = 8.55;
export const WALL_LOCAL_HOTSPOT_RADIUS_PCT = LOCAL_HOTSPOT_R;

function countLocalNeighbors(
  left: number,
  top: number,
  placed: Placed[],
  ex: ReturnType<typeof gridExtents>,
): number {
  const r = inCenterTerritory(left, ex)
    ? LOCAL_HOTSPOT_R_CENTER
    : LOCAL_HOTSPOT_R;
  const r2 = r * r;
  let n = 0;
  for (const q of placed) {
    const dx = (left - q.left) * 0.9;
    const dy = top - q.top;
    if (dx * dx + dy * dy < r2) n += 1;
  }
  return n;
}

function localDensityOk(
  left: number,
  top: number,
  placed: Placed[],
  role: WallRole,
  ex: ReturnType<typeof gridExtents>,
): boolean {
  const n = countLocalNeighbors(left, top, placed, ex);
  const center = inCenterTerritory(left, ex);
  if (center) return n <= 2;
  const cap = role === "support" ? 3 : role === "texture" ? 4 : 3;
  return n <= cap;
}

function roleSepMul(a: WallRole, b: WallRole): number {
  if (a === "headline" && b === "headline") return 2.08;
  if (
    (a === "support" && b === "headline") ||
    (a === "headline" && b === "support")
  ) {
    return 1.22;
  }
  if (
    (a === "support" && b === "texture") ||
    (a === "texture" && b === "support")
  ) {
    return 0.88;
  }
  if (a === "texture" && b === "texture") return 0.72;
  if (a === "texture" || b === "texture") return 1.06;
  return 1.1;
}

function minSepOk(
  left: number,
  top: number,
  size: ProjectSize,
  placed: Placed[],
  sepMul: number,
  role: WallRole,
  ex: ReturnType<typeof gridExtents>,
): boolean {
  const cNew = inCenterTerritory(left, ex);
  for (const q of placed) {
    let need = sepMin(size, q.size) * sepMul;
    need *= roleSepMul(role, q.role);
    const cQ = inCenterTerritory(q.left, ex);
    if (cNew && cQ) need *= 1.26;
    else if (cNew || cQ) need *= 1.11;
    const dx = (left - q.left) * 0.885;
    const dy = top - q.top;
    if (dx * dx + dy * dy < need * need) return false;
  }
  return true;
}

/** Board rectangle for grid (percent). */
function gridExtents(size: ProjectSize, role: WallRole): {
  leftMin: number;
  leftMax: number;
  topMin: number;
  topMax: number;
} {
  const hw = effectiveHalfWidthPct(size);
  let leftMin = BOARD_PAD_X + hw * 0.35;
  let leftMax = muralContentRightPct() - hw * 0.35;
  let topMin = NAME_EXCL_BOTTOM + hw * 0.55;
  let topMax = EMAIL_EXCL_TOP - hw * 0.9;
  if (role !== "texture") {
    leftMin = Math.max(leftMin, NAME_EXCL_RIGHT * 0.35);
  }
  return { leftMin, leftMax, topMin, topMax };
}

function cellCenter(
  col: number,
  row: number,
  ex: ReturnType<typeof gridExtents>,
  slug: string,
): { left: number; top: number } {
  const cw = (ex.leftMax - ex.leftMin) / GRID_COLS;
  const ch = (ex.topMax - ex.topMin) / GRID_ROWS;
  let left = ex.leftMin + (col + 0.5) * cw;
  if (col === 1) left -= cw * 0.16;
  if (col === 3) left += cw * 0.16;
  if (col === 2) {
    left += (hash01(slug, 901) - 0.5) * cw * 0.62;
  }
  const top = ex.topMin + (row + 0.5) * ch;
  return { left, top };
}

function gridJitterPct(
  slug: string,
  salt: number,
  ex: ReturnType<typeof gridExtents>,
  col: number,
): { dx: number; dy: number } {
  const base = cellCenter(col, 0, ex, slug);
  const centerHeavy = inCenterTerritory(base.left, ex);
  const j = centerHeavy
    ? 2.25 + hash01(slug, salt + 11) * 2.35
    : 1.5 + hash01(slug, salt + 11) * 1.5;
  const vertBoost = centerHeavy ? 1.18 : 1;
  return {
    dx: (hash01(slug, salt) - 0.5) * 2 * j,
    dy: (hash01(slug, salt + 7) - 0.5) * 2 * j * vertBoost,
  };
}

function gridRotateDeg(slug: string, role: WallRole, salt: number): number {
  const amp = 1.55 + hash01(slug, salt + 3) * 1.45;
  const v = (hash01(slug, salt) - 0.5) * 2 * amp;
  const damp = role === "headline" ? 0.82 : 0.95;
  return Math.round(v * damp * 100) / 100;
}

function placementOk(
  left: number,
  top: number,
  size: ProjectSize,
  placed: Placed[],
  role: WallRole,
  sepMul: number,
  ex: ReturnType<typeof gridExtents>,
): boolean {
  if (!minSepOk(left, top, size, placed, sepMul, role, ex)) return false;
  if (!localDensityOk(left, top, placed, role, ex)) return false;
  if (
    overlapsNamePlate(left, top, size) ||
    overlapsEmailPlate(left, top, size) ||
    overlapsIndexBand(left, top, size)
  ) {
    return false;
  }
  return true;
}

function relaxPlacement(
  left: number,
  top: number,
  size: ProjectSize,
  placed: Placed[],
  role: WallRole,
  sepMul: number,
  slug: string,
  ex: ReturnType<typeof gridExtents>,
): { left: number; top: number } {
  let L = left;
  let T = top;
  const midX = (ex.leftMin + ex.leftMax) / 2;
  const midY = (ex.topMin + ex.topMax) / 2;
  for (let k = 0; k < 72; k++) {
    if (placementOk(L, T, size, placed, role, sepMul, ex)) break;
    const s = 0.42 + k * 0.038;
    if (inCenterTerritory(L, ex)) {
      L += (L - midX) * (0.24 + k * 0.008);
      T += (T - midY) * (0.11 + k * 0.004);
    }
    L =
      left +
      (hash01(slug, k + 50) - 0.5) * 2 * s * 2.95 +
      (hash01(slug, k + 80) - 0.5) * 0.95;
    T =
      top +
      (hash01(slug, k + 110) - 0.5) * 2 * s * 2.55 +
      (hash01(slug, k + 140) - 0.5) * 0.82;
    L = clampWallLeftPct(L, size, role);
    T = Math.max(ex.topMin + 1, Math.min(ex.topMax - 1, T));
  }
  return { left: L, top: T };
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

function buildMetasForWall(projects: Project[]): WallMeta[] {
  const n = projects.length;
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

  const textureCut = byScoreDesc[Math.floor(n * 0.5)]?.score ?? -Infinity;
  const isTexture = (idx: number) => {
    const row = scored.find((x) => x.idx === idx)!;
    return !headlineIdx.has(idx) && row.score < textureCut;
  };

  return projects.map((p, idx) => {
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
      layoutSize =
        p.size === "sm" ? bumpSize(p.size, 1) : bumpSize(p.size, -1);
    } else {
      if (p.size === "sm") layoutSize = bumpSize(p.size, 1);
      else if (p.priority === "small") layoutSize = bumpSize(p.size, 0);
    }

    return { idx, p, score, layoutSize, role };
  });
}

export type WallDebugTerritoryBand = {
  label: "L" | "C" | "R";
  leftPct: number;
  widthPct: number;
};

export type WallDebugPosterMark = {
  idx: number;
  slug: string;
  role: WallRole;
  leftPct: number;
  topPct: number;
  halfWidthPct: number;
  halfHeightPct: number;
  hotspotRadiusPct: number;
  sepVsMdPct: number;
};

export type WallDebugOverlay = {
  territory: WallDebugTerritoryBand[];
  /** Inset-normalized grid (same % space as posters). */
  grid?: { verticalsPct: number[]; horizontalsPct: number[] };
  posters: WallDebugPosterMark[];
};

function getDebugTerritoryBands(): WallDebugTerritoryBand[] {
  const ex = gridExtents("md", "support");
  const w = ex.leftMax - ex.leftMin;
  const x0 = ex.leftMin + w / 3;
  const x1 = ex.leftMin + (2 * w) / 3;
  return [
    {
      label: "L",
      leftPct: ex.leftMin,
      widthPct: Math.max(0.2, x0 - ex.leftMin),
    },
    {
      label: "C",
      leftPct: x0,
      widthPct: Math.max(0.2, x1 - x0),
    },
    {
      label: "R",
      leftPct: x1,
      widthPct: Math.max(0.2, ex.leftMax - x1),
    },
  ];
}

export function getWallDebugOverlayData(
  projects: Project[],
  layouts: PosterWallLayout[],
): WallDebugOverlay | null {
  if (!DEBUG_WALL_LAYOUT) return null;
  if (projects.length === 0 || projects.length !== layouts.length) return null;

  const metas = buildMetasForWall(projects);
  const metaByIdx = new Map(metas.map((m) => [m.idx, m]));
  const territory = getDebugTerritoryBands();
  const posters: WallDebugPosterMark[] = projects.map((p, i) => {
    const m = metaByIdx.get(i)!;
    const lay = layouts[i]!;
    const hw = effectiveHalfWidthPct(m.layoutSize);
    return {
      idx: i,
      slug: p.slug,
      role: m.role,
      leftPct: lay.leftPct,
      topPct: lay.topPct,
      halfWidthPct: hw,
      halfHeightPct: hw * 1.25,
      hotspotRadiusPct: LOCAL_HOTSPOT_R,
      sepVsMdPct: sepMin(m.layoutSize, "md"),
    };
  });
  const ex = gridExtents("md", "support");
  const cw = (ex.leftMax - ex.leftMin) / GRID_COLS;
  const ch = (ex.topMax - ex.topMin) / GRID_ROWS;
  const verticalsPct = Array.from({ length: GRID_COLS - 1 }, (_, i) =>
    Math.round((ex.leftMin + (i + 1) * cw) * 100) / 100,
  );
  const horizontalsPct = Array.from({ length: GRID_ROWS - 1 }, (_, i) =>
    Math.round((ex.topMin + (i + 1) * ch) * 100) / 100,
  );
  return { territory, grid: { verticalsPct, horizontalsPct }, posters };
}

type CellKey = `${number},${number}`;

function keyCell(c: number, r: number): CellKey {
  return `${c},${r}`;
}

function assignGridCells(
  metas: WallMeta[],
): Map<number, { c: number; r: number }> {
  const taken = new Set<CellKey>();
  const assign = new Map<number, { c: number; r: number }>();

  const take = (c: number, r: number, idx: number) => {
    if (c < 0 || c >= GRID_COLS || r < 0 || r >= GRID_ROWS) return false;
    const k = keyCell(c, r);
    if (taken.has(k)) return false;
    taken.add(k);
    assign.set(idx, { c, r });
    return true;
  };

  const heroMetas = PRIORITY_HERO_ORDER.map((slug) =>
    metas.find((m) => m.p.slug === slug && m.role === "headline"),
  ).filter(Boolean) as WallMeta[];

  for (const m of heroMetas) {
    const cell = HERO_GRID_CELL[m.p.slug];
    if (cell) take(cell.c, cell.r, m.idx);
  }

  const otherHeadlines = metas
    .filter((m) => m.role === "headline" && !assign.has(m.idx))
    .sort((a, b) => b.score - a.score);

  const headlinePool: Array<{ c: number; r: number }> = [
    { c: 2, r: 2 },
    { c: 1, r: 2 },
    { c: 3, r: 2 },
    { c: 0, r: 1 },
    { c: 4, r: 1 },
    { c: 2, r: 3 },
    { c: 0, r: 2 },
    { c: 4, r: 2 },
    { c: 1, r: 0 },
    { c: 3, r: 0 },
    { c: 1, r: 3 },
    { c: 3, r: 3 },
  ];
  let hi = 0;
  for (const m of otherHeadlines) {
    let placedH = false;
    for (; hi < headlinePool.length; hi++) {
      const slot = headlinePool[hi]!;
      if (take(slot.c, slot.r, m.idx)) {
        placedH = true;
        hi++;
        break;
      }
    }
    if (!placedH) break;
  }

  const supportQueue = metas
    .filter((m) => m.role === "support")
    .sort((a, b) => b.score - a.score);

  const supportPool: Array<{ c: number; r: number }> = [];
  for (const r of [2, 1, 3, 0]) {
    for (const c of [2, 1, 3, 0, 4]) {
      supportPool.push({ c, r });
    }
  }
  for (const { c, r } of supportPool) {
    if (supportQueue.length === 0) break;
    const k = keyCell(c, r);
    if (taken.has(k)) continue;
    const m = supportQueue.shift()!;
    take(c, r, m.idx);
  }

  const textureQueue = metas
    .filter((m) => m.role === "texture")
    .sort((a, b) => a.score - b.score);

  const texturePool: Array<{ c: number; r: number }> = [];
  for (const c of [0, 4, 1, 3, 2]) texturePool.push({ c, r: 3 });
  for (const r of [0, 1]) {
    for (const c of [0, 4]) texturePool.push({ c, r });
  }
  for (const { c, r } of texturePool) {
    if (textureQueue.length === 0) break;
    const k = keyCell(c, r);
    if (taken.has(k)) continue;
    const m = textureQueue.shift()!;
    take(c, r, m.idx);
  }

  const remaining = metas.filter((m) => !assign.has(m.idx));
  for (const m of remaining) {
    let placedCell = false;
    for (let r = GRID_ROWS - 1; r >= 0 && !placedCell; r--) {
      for (let c = 0; c < GRID_COLS && !placedCell; c++) {
        placedCell = take(c, r, m.idx);
      }
    }
  }

  return assign;
}

export function computeWallLayouts(projects: Project[]): PosterWallLayout[] {
  const n = projects.length;
  if (n === 0) return [];

  const metas = buildMetasForWall(projects);
  const byIdx = new Map(metas.map((m) => [m.idx, m]));
  const cellByIdx = assignGridCells(metas);

  const orderPlace = [...metas].sort((a, b) => {
    const ra = roleRank(a.role);
    const rb = roleRank(b.role);
    if (ra !== rb) return ra - rb;
    if (a.role === "headline" && b.role === "headline") return b.score - a.score;
    if (a.role === "texture" && b.role === "texture") return a.score - b.score;
    return b.score - a.score;
  });

  const placed: Placed[] = [];
  const out: PosterWallLayout[] = new Array(n);
  let seq = 0;

  for (const m of orderPlace) {
    const cell = cellByIdx.get(m.idx);
    const ex = gridExtents(m.layoutSize, m.role);
    let left: number;
    let top: number;
    if (cell) {
      const base = cellCenter(cell.c, cell.r, ex, m.p.slug);
      const jit = gridJitterPct(
        m.p.slug,
        m.idx + seq * 17,
        ex,
        cell.c,
      );
      left = base.left + jit.dx;
      top = base.top + jit.dy;
    } else {
      left = wallContentMidpointPct(m.layoutSize);
      top = (ex.topMin + ex.topMax) / 2;
    }

    const inC = inCenterTerritory(left, ex);
    const sepMul =
      m.role === "headline"
        ? inC
          ? 1.28
          : 1.12
        : m.role === "support"
          ? inC
            ? 1.12
            : 1.03
          : inC
            ? 1.04
            : 0.97;

    const fin = relaxPlacement(
      left,
      top,
      m.layoutSize,
      placed,
      m.role,
      sepMul,
      m.p.slug,
      ex,
    );
    left = clampWallLeftPct(fin.left, m.layoutSize, m.role);
    top = fin.top;

    placed.push({
      left,
      top,
      size: m.layoutSize,
      role: m.role,
      slug: m.p.slug,
    });

    const headlineOrder = metas
      .filter((x) => x.role === "headline")
      .sort((a, b) => b.score - a.score);
    const rankH =
      m.role === "headline"
        ? headlineOrder.findIndex((x) => x.idx === m.idx)
        : -1;
    const zBase =
      m.role === "headline"
        ? 68 + Math.max(0, 12 - Math.max(0, rankH)) * 1.05
        : m.role === "support"
          ? 32 + Math.round(hash01(m.p.slug, 606 + seq) * 12)
          : 12 + (seq % 5) + Math.round(hash01(m.p.slug, 999) * 5);

    out[m.idx] = {
      topPct: Math.round(top * 10) / 10,
      leftPct: Math.round(left * 10) / 10,
      width: widthForProjectSize(m.layoutSize),
      zIndex: Math.min(80, Math.round(zBase)),
      rotateDeg: gridRotateDeg(m.p.slug, m.role, seq + m.idx),
      offsetXPx: Math.round(handOffsetPx(m.p.slug, seq, 0) * 0.55),
      offsetYPx: Math.round(handOffsetPx(m.p.slug, seq, 1) * 0.55),
    };
    seq++;
  }

  for (let i = 0; i < n; i++) {
    if (!out[i]) {
      const m = byIdx.get(i)!;
      const ex = gridExtents(m.layoutSize, m.role);
      out[i] = {
        topPct: Math.round(((ex.topMin + ex.topMax) / 2) * 10) / 10,
        leftPct: Math.round(wallContentMidpointPct(m.layoutSize) * 10) / 10,
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

function roleRank(r: WallRole): number {
  if (r === "headline") return 0;
  if (r === "support") return 1;
  return 2;
}
