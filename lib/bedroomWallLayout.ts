import {
  type Project,
  type ProjectPriority,
  type ProjectSize,
} from "@/lib/projects";

/** Per-poster placement for the wall (pure). */
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

/** Debug / rough density hint only (no placement physics). */
export const WALL_LOCAL_HOTSPOT_RADIUS_PCT = 8.2;

const NAME_EXCL_RIGHT = 20;
const NAME_EXCL_BOTTOM = 16;
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

type WallMeta = {
  idx: number;
  p: Project;
  score: number;
  layoutSize: ProjectSize;
  role: WallRole;
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

/** Board rectangle for vertical clamp (percent). */
function gridExtents(size: ProjectSize, role: WallRole): {
  leftMin: number;
  leftMax: number;
  topMin: number;
  topMax: number;
} {
  const hw = effectiveHalfWidthPct(size);
  let leftMin = BOARD_PAD_X + hw * 0.35;
  const leftMax = muralContentRightPct() - hw * 0.35;
  const topMin = NAME_EXCL_BOTTOM + hw * 0.55;
  const topMax = EMAIL_EXCL_TOP - hw * 0.9;
  if (role !== "texture") {
    leftMin = Math.max(leftMin, NAME_EXCL_RIGHT * 0.35);
  }
  return { leftMin, leftMax, topMin, topMax };
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

function handOffsetPx(slug: string, k: number, axis: 0 | 1): number {
  let h = k * 140973497 + axis * 7903991;
  for (let i = 0; i < slug.length; i++) {
    h = (h + slug.charCodeAt(i) * (i * 7 + axis + 2)) >>> 0;
  }
  const mag = 8 + (h % 9);
  const sign = (h >>> 5) & 1 ? 1 : -1;
  return sign * mag;
}

/** One art-directed slot on the foamcore board (viewport % center, CSS tier, tilt, stacking). */
export type ManualBoardSlot = {
  leftPct: number;
  topPct: number;
  size: ProjectSize;
  rotateDeg: number;
  zIndex: number;
};

/**
 * Fixed slot map — ordered **best first**. Projects are sorted by `wallPlacementScore` (newest +
 * anchors + priority); rank 0 takes slot 0, etc.
 *
 * Wide foamcore + extra vertical breathing: heroes nudged up (name-safe), lower rows eased down
 * (email-safe); horizontal rhythm unchanged.
 */
const MANUAL_BOARD_SLOTS: ManualBoardSlot[] = [
  { leftPct: 11.5, topPct: 22.4, size: "xl", rotateDeg: 0.5, zIndex: 76 },
  { leftPct: 40.2, topPct: 22.1, size: "xl", rotateDeg: -0.45, zIndex: 75 },
  { leftPct: 68, topPct: 22.5, size: "xl", rotateDeg: -0.58, zIndex: 74 },
  { leftPct: 24.8, topPct: 25.3, size: "lg", rotateDeg: 0.26, zIndex: 71 },
  { leftPct: 55.5, topPct: 25.1, size: "lg", rotateDeg: -0.24, zIndex: 70 },
  { leftPct: 9.5, topPct: 38.1, size: "lg", rotateDeg: -0.32, zIndex: 64 },
  { leftPct: 72.5, topPct: 38.3, size: "lg", rotateDeg: 0.3, zIndex: 63 },
  { leftPct: 31, topPct: 38.5, size: "md", rotateDeg: 0.14, zIndex: 54 },
  { leftPct: 48.5, topPct: 38, size: "md", rotateDeg: -0.1, zIndex: 53 },
  { leftPct: 62, topPct: 38.9, size: "md", rotateDeg: -0.2, zIndex: 52 },
  { leftPct: 19, topPct: 40.9, size: "md", rotateDeg: 0.18, zIndex: 50 },
  { leftPct: 40, topPct: 41.3, size: "md", rotateDeg: -0.08, zIndex: 49 },
  { leftPct: 58, topPct: 40.7, size: "md", rotateDeg: 0.12, zIndex: 48 },
  { leftPct: 13, topPct: 49.2, size: "md", rotateDeg: 0.22, zIndex: 46 },
  { leftPct: 27, topPct: 49.6, size: "md", rotateDeg: -0.16, zIndex: 45 },
  { leftPct: 44, topPct: 48.8, size: "md", rotateDeg: 0.1, zIndex: 44 },
  { leftPct: 66, topPct: 49.4, size: "md", rotateDeg: -0.22, zIndex: 43 },
  { leftPct: 52, topPct: 51, size: "sm", rotateDeg: -0.06, zIndex: 42 },
  { leftPct: 34, topPct: 50.8, size: "sm", rotateDeg: 0.08, zIndex: 41 },
  { leftPct: 74, topPct: 50.6, size: "sm", rotateDeg: 0.14, zIndex: 40 },
  { leftPct: 10.5, topPct: 56, size: "md", rotateDeg: -0.26, zIndex: 39 },
  { leftPct: 23.5, topPct: 57, size: "md", rotateDeg: 0.16, zIndex: 38 },
  { leftPct: 38, topPct: 56.2, size: "md", rotateDeg: -0.12, zIndex: 37 },
  { leftPct: 56, topPct: 56.6, size: "md", rotateDeg: 0.2, zIndex: 36 },
  { leftPct: 69, topPct: 56.3, size: "md", rotateDeg: -0.14, zIndex: 35 },
  { leftPct: 47, topPct: 58.4, size: "sm", rotateDeg: 0.06, zIndex: 34 },
  { leftPct: 16, topPct: 59, size: "sm", rotateDeg: -0.1, zIndex: 33 },
  { leftPct: 63, topPct: 58.8, size: "sm", rotateDeg: 0.11, zIndex: 32 },
  { leftPct: 30, topPct: 62.2, size: "md", rotateDeg: 0.14, zIndex: 31 },
  { leftPct: 41.5, topPct: 62, size: "md", rotateDeg: -0.09, zIndex: 30 },
  { leftPct: 53, topPct: 62.6, size: "md", rotateDeg: 0.18, zIndex: 29 },
  { leftPct: 12, topPct: 66.8, size: "md", rotateDeg: -0.2, zIndex: 28 },
  { leftPct: 25, topPct: 67.4, size: "sm", rotateDeg: 0.12, zIndex: 27 },
  { leftPct: 36, topPct: 67, size: "sm", rotateDeg: -0.07, zIndex: 26 },
  { leftPct: 60, topPct: 67.2, size: "sm", rotateDeg: -0.11, zIndex: 25 },
  { leftPct: 71, topPct: 66.9, size: "sm", rotateDeg: 0.09, zIndex: 24 },
  { leftPct: 48, topPct: 68.8, size: "sm", rotateDeg: 0.05, zIndex: 23 },
  { leftPct: 19, topPct: 72.2, size: "sm", rotateDeg: -0.15, zIndex: 22 },
  { leftPct: 33, topPct: 72.6, size: "sm", rotateDeg: 0.13, zIndex: 21 },
  { leftPct: 45, topPct: 72, size: "sm", rotateDeg: -0.08, zIndex: 20 },
  { leftPct: 64, topPct: 72.4, size: "sm", rotateDeg: 0.16, zIndex: 19 },
  { leftPct: 40, topPct: 75.8, size: "sm", rotateDeg: 0.04, zIndex: 18 },
];

function overflowBoardSlot(rank: number): ManualBoardSlot {
  const base = MANUAL_BOARD_SLOTS.length;
  const i = rank - base;
  const ex = gridExtents("sm", "support");
  const cols = 5;
  const col = i % cols;
  const row = Math.floor(i / cols);
  const cw = (ex.leftMax - ex.leftMin) / cols;
  const left = ex.leftMin + (col + 0.5) * cw;
  const ch = (ex.topMax - ex.topMin) / 8;
  const top = Math.min(ex.topMax - 2, ex.topMin + 52 + row * ch);
  return {
    leftPct: Math.round(left * 100) / 100,
    topPct: Math.round(top * 100) / 100,
    size: "sm",
    rotateDeg: Math.round(((i % 3) - 1) * 0.12 * 100) / 100,
    zIndex: 16 + (i % 7),
  };
}

function slotForRank(rank: number): ManualBoardSlot {
  return MANUAL_BOARD_SLOTS[rank] ?? overflowBoardSlot(rank);
}

function slotSizeForProjectIdx(
  projects: Project[],
  metas: WallMeta[],
  idx: number,
): ProjectSize {
  const ranked = [...metas].sort((a, b) => b.score - a.score || a.idx - b.idx);
  const pos = ranked.findIndex((m) => m.idx === idx);
  if (pos < 0) return "md";
  return slotForRank(pos).size;
}

function pseudoSepMin(a: ProjectSize, b: ProjectSize): number {
  const SIZE_SEP_PCT: Record<ProjectSize, number> = {
    xl: 11.85,
    lg: 10.5,
    md: 8.45,
    sm: 7.15,
  };
  return (SIZE_SEP_PCT[a] + SIZE_SEP_PCT[b]) * 0.45;
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

const DEBUG_GRID_COLS = 5;
const DEBUG_GRID_ROWS = 3;

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
    const slotSz = slotSizeForProjectIdx(projects, metas, i);
    const hw = effectiveHalfWidthPct(slotSz);
    return {
      idx: i,
      slug: p.slug,
      role: m.role,
      leftPct: lay.leftPct,
      topPct: lay.topPct,
      halfWidthPct: hw,
      halfHeightPct: hw * 1.25,
      hotspotRadiusPct: WALL_LOCAL_HOTSPOT_RADIUS_PCT,
      sepVsMdPct: pseudoSepMin(slotSz, "md"),
    };
  });
  const ex = gridExtents("md", "support");
  const cw = (ex.leftMax - ex.leftMin) / DEBUG_GRID_COLS;
  const ch = (ex.topMax - ex.topMin) / DEBUG_GRID_ROWS;
  const verticalsPct = Array.from(
    { length: DEBUG_GRID_COLS - 1 },
    (_, i) => Math.round((ex.leftMin + (i + 1) * cw) * 100) / 100,
  );
  const horizontalsPct = Array.from(
    { length: DEBUG_GRID_ROWS - 1 },
    (_, i) => Math.round((ex.topMin + (i + 1) * ch) * 100) / 100,
  );
  return { territory, grid: { verticalsPct, horizontalsPct }, posters };
}

/** New additions — pinned to unused manual slots so the existing board does not reshuffle. */
const WALL_OVERFLOW_SLOT_SLUGS = [
  "jean-dawson-sick-of-it",
  "jean-dawson-pirate-radio",
  "jean-dawson-three-heads",
] as const;

const WALL_OVERFLOW_SLOT_RANKS = [39, 40, 41] as const;

function assignWallLayoutFromSlot(
  m: WallMeta,
  slotRank: number,
  seq: number,
): PosterWallLayout {
  const slot = slotForRank(slotRank);
  const ex = gridExtents(slot.size, m.role);
  let left = slot.leftPct;
  let top = slot.topPct;
  left = clampWallLeftPct(left, slot.size, m.role);
  top = Math.max(ex.topMin + 0.5, Math.min(ex.topMax - 0.5, top));
  return {
    leftPct: Math.round(left * 10) / 10,
    topPct: Math.round(top * 10) / 10,
    width: widthForProjectSize(slot.size),
    zIndex: Math.min(80, Math.max(0, Math.round(slot.zIndex))),
    rotateDeg: Math.round(slot.rotateDeg * 100) / 100,
    offsetXPx: Math.round(handOffsetPx(m.p.slug, seq, 0) * 0.55),
    offsetYPx: Math.round(handOffsetPx(m.p.slug, seq, 1) * 0.55),
  };
}

/** Pairwise exchanges: only these slugs trade their computed slot layout (position, size, z, tilt, hand offsets). */
const WALL_LAYOUT_SLUG_SWAPS: [string, string][] = [
  ["sabrina-carpenter-tears", "charlie-puth-thats-not-how-this-works"],
  ["burger-king-whopper-by-you", "doja-cat-jealous-type"],
];

function applyWallLayoutSlugSwaps(
  projects: Project[],
  layouts: PosterWallLayout[],
): void {
  for (const [slugA, slugB] of WALL_LAYOUT_SLUG_SWAPS) {
    const ia = projects.findIndex((p) => p.slug === slugA);
    const ib = projects.findIndex((p) => p.slug === slugB);
    if (ia < 0 || ib < 0) continue;
    const tmp = layouts[ia]!;
    layouts[ia] = layouts[ib]!;
    layouts[ib] = tmp;
  }
}

export function computeWallLayouts(projects: Project[]): PosterWallLayout[] {
  const n = projects.length;
  if (n === 0) return [];

  const metas = buildMetasForWall(projects);
  const overflowSet = new Set<string>(WALL_OVERFLOW_SLOT_SLUGS);
  const ranked = [...metas]
    .filter((m) => !overflowSet.has(m.p.slug))
    .sort((a, b) => b.score - a.score || a.idx - b.idx);
  const out: PosterWallLayout[] = new Array(n);

  for (let s = 0; s < ranked.length; s++) {
    const m = ranked[s]!;
    out[m.idx] = assignWallLayoutFromSlot(m, s, s);
  }

  for (let i = 0; i < WALL_OVERFLOW_SLOT_SLUGS.length; i++) {
    const slug = WALL_OVERFLOW_SLOT_SLUGS[i]!;
    const rank = WALL_OVERFLOW_SLOT_RANKS[i]!;
    const m = metas.find((x) => x.p.slug === slug);
    if (!m) continue;
    out[m.idx] = assignWallLayoutFromSlot(m, rank, ranked.length + i);
  }

  for (let i = 0; i < n; i++) {
    if (!out[i]) {
      const m = metas[i]!;
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

  applyWallLayoutSlugSwaps(projects, out);
  return out;
}
