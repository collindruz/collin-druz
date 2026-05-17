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

const PR_RANK: Record<ProjectPriority, number> = {
  hero: 520_000,
  large: 135_000,
  standard: 28_000,
  small: 6_000,
};

const HALF_WIDTH_VW: Record<ProjectSize, number> = {
  xl: 12.2 / 2,
  lg: 10.35 / 2,
  md: 8.7 / 2,
  sm: 7.05 / 2,
};

const UI_MARGIN_PCT = 5;

const RAIL_RIGHT_MARGIN_PCT = 1.35;
const RAIL_PANEL_WIDTH_VW = 17;

const WALL_HAND_SLACK_PCT = 2.6;

const WALL_COMPACT_THUMB_SLUGS = new Set<string>([
  "smirnoff-live-louder-karol-g",
]);

const WALL_PROMINENCE_SKIP_SLUGS = new Set<string>(["doja-cat-gorgeous"]);

/** Named headline anchors — upper/center constellation. */
const HEADLINE_ANCHOR_SLUGS = [
  "le-sserafim-easy",
  "sabrina-carpenter-taste",
  "lil-dicky-hahaha-i-love-myself",
  "charlie-puth-thats-not-how-this-works",
  "doja-cat-agora-hills",
] as const;

const HEADLINE_ANCHOR_SET = new Set<string>(HEADLINE_ANCHOR_SLUGS);

/** Authored in legacy 50% viewport space; shifted to mural midpoint. */
const LAYOUT_LEGACY_VIEWPORT_CENTER = 50;

const NAME_EXCL_RIGHT = 17 + UI_MARGIN_PCT;
const NAME_EXCL_BOTTOM = 9 + UI_MARGIN_PCT;
const EMAIL_EXCL_RIGHT = 24 + UI_MARGIN_PCT;
const EMAIL_EXCL_TOP =
  100 - UI_MARGIN_PCT - 4 - 11 - UI_MARGIN_PCT;

function railLeftEdgePct(): number {
  return 100 - RAIL_RIGHT_MARGIN_PCT - RAIL_PANEL_WIDTH_VW;
}

function muralContentRightPct(): number {
  return railLeftEdgePct() - UI_MARGIN_PCT;
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
    minC -= 2.4;
    maxC += 1.5;
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

/** Single scoring model: newest + named work + commercial weight + catalogue role. */
function wallPlacementScore(idx: number, p: Project): number {
  let s = yearNum(p) * 800_000;
  s += (2_000 - Math.min(idx, 1_999));
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

function rotateDegFor(slug: string, k: number, role: WallRole): number {
  let h = k * 2654435761;
  for (let i = 0; i < slug.length; i++) {
    h = (h + slug.charCodeAt(i) * (i + 3)) >>> 0;
  }
  const t = (h % 1000) / 1000;
  const base = -2 + t * 4;
  const mul = role === "headline" ? 0.72 : role === "support" ? 0.95 : 1.08;
  return base * mul;
}

/** Hard anchors — horizontal mass pulled slightly inward; vertical stagger (no single band). */
const ANCHOR_BY_SLUG: Record<string, { left: number; top: number }> = {
  "le-sserafim-easy": { left: 50.2, top: 15.8 },
  "sabrina-carpenter-taste": { left: 31.8, top: 20.6 },
  "lil-dicky-hahaha-i-love-myself": { left: 67.5, top: 18.9 },
  "charlie-puth-thats-not-how-this-works": { left: 41.5, top: 42.4 },
  "doja-cat-agora-hills": { left: 55.8, top: 38.2 },
};

function anchorTopClamp(slug: string): { min: number; max: number } {
  if (
    slug === "charlie-puth-thats-not-how-this-works" ||
    slug === "doja-cat-agora-hills"
  ) {
    return { min: 30, max: 47 };
  }
  return { min: 12.5, max: 28.5 };
}

/** Extra headline pieces orbit the emotional core (not on a horizontal line). */
const HEADLINE_ORBIT: Array<{ left: number; top: number }> = [
  { left: 46, top: 28 },
  { left: 58, top: 26 },
  { left: 38, top: 34 },
  { left: 52, top: 31 },
  { left: 44, top: 24 },
  { left: 61, top: 33 },
  { left: 35, top: 28 },
  { left: 56, top: 22 },
  { left: 48, top: 35 },
  { left: 40, top: 40 },
];

type Placed = {
  left: number;
  top: number;
  size: ProjectSize;
  role: WallRole;
  slug: string;
};

function roleSepMul(a: WallRole, b: WallRole): number {
  if (a === "headline" && b === "headline") return 1.38;
  if (a === "texture" && b === "texture") return 0.7;
  if (a === "texture" || b === "texture") return 0.82;
  if (a === "headline" || b === "headline") return 1.05;
  return 1;
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
    const dx = (left - q.left) * 0.91;
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
      L += (hash01(slug, tries + 180) - 0.5) * 3.2;
      T += (hash01(slug, tries + 241) - 0.5) * 2.4;
    } else if (overlapsIndexBand(L, T, size)) {
      L -= 2.6;
      T += (hash01(slug, tries + 90) - 0.5) * 1.4;
    } else if (overlapsEmailPlate(L, T, size)) {
      T -= 1.8;
      L += 1.2;
    } else if (overlapsNamePlate(L, T, size)) {
      L += 1.9;
      T += 0.8;
    }
    L = clampWallLeftPct(L, size, role);
    T = Math.max(topMin, Math.min(topMax, T));
    tries++;
  }
  return { left: L, top: T };
}

function breathingPush(left: number, top: number, slug: string): { dl: number; dt: number } {
  if (hash01(slug, 990) < 0.18) return { dl: 0, dt: 0 };
  const pockets = [
    { lx: 12, ly: 17.5, r: 11.2, push: 5.4 },
    { lx: 63, ly: 33.5, r: 10.5, push: 4.6 },
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

function diagonalBias(slug: string, salt: number): { dl: number; dt: number } {
  const u = hash01(slug, 710 + salt);
  const v = hash01(slug, 711 + salt);
  return {
    dl: (u - 0.38) * 9.2,
    dt: (v - 0.3) * 7.4,
  };
}

type WallMeta = {
  idx: number;
  p: Project;
  score: number;
  layoutSize: ProjectSize;
  role: WallRole;
};

/** Newest-first for index + sheets; tiebreak by wall strength so rail tracks hero reads. */
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

  let orbitK = 0;

  const placeHeadline = (m: WallMeta, baseLeft: number, baseTop: number, band: { min: number; max: number }) => {
    const slug = m.p.slug;
    const sepMul = 1.78;
    let left =
      baseLeft +
      (hash01(slug, 2) - 0.5) * 2.5 +
      (hash01(slug, 3) - 0.5) * 1.4;
    let top =
      baseTop +
      (hash01(slug, 1) - 0.5) * 3.6 +
      (hash01(slug, 4) - 0.5) * 2.2;

    left = clampWallLeftPct(left, m.layoutSize, "headline");
    top = Math.max(band.min, Math.min(band.max, top));

    for (let t = 0; t < 44 && !minSepOk(left, top, m.layoutSize, placed, sepMul, "headline"); t++) {
      left += (hash01(slug, t + 20) - 0.5) * 2.8;
      top += (hash01(slug, t + 50) - 0.5) * 2.1;
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
    const zBase = 62 + Math.max(0, 14 - rankH) * 1.15;
    out[m.idx] = {
      topPct: Math.round(top * 10) / 10,
      leftPct: Math.round(left * 10) / 10,
      width: widthForProjectSize(m.layoutSize),
      zIndex: Math.min(82, Math.round(zBase + hash01(slug, 505) * 4)),
      rotateDeg:
        Math.round(rotateDegFor(slug, seq, "headline") * 100) / 100,
      offsetXPx: Math.round(handOffsetPx(slug, seq, 0) * 0.62),
      offsetYPx: Math.round(handOffsetPx(slug, seq, 1) * 0.62),
    };
    seq++;
  };

  for (const slug of HEADLINE_ANCHOR_SLUGS) {
    const m = metas.find((x) => x.p.slug === slug && x.role === "headline");
    if (!m) continue;
    const raw = ANCHOR_BY_SLUG[slug];
    if (!raw) continue;
    const band = anchorTopClamp(slug);
    placeHeadline(m, shiftFromLegacyViewportCenter(raw.left), raw.top, band);
  }

  for (const m of headlineMetas) {
    if (ANCHOR_BY_SLUG[m.p.slug]) continue;
    const slot = HEADLINE_ORBIT[orbitK % HEADLINE_ORBIT.length]!;
    orbitK++;
    const jittered = {
      left: shiftFromLegacyViewportCenter(slot.left + (hash01(m.p.slug, 820) - 0.5) * 5),
      top: slot.top + (hash01(m.p.slug, 821) - 0.5) * 4,
    };
    placeHeadline(m, jittered.left, jittered.top, { min: 22, max: 49 });
  }

  const supportList = metas.filter((m) => m.role === "support");
  supportList.sort((a, b) => b.score - a.score);

  const textureList = metas.filter((m) => m.role === "texture");
  textureList.sort(
    (a, b) => hash01(a.p.slug, 777) - hash01(b.p.slug, 888),
  );

  const supportN = Math.max(supportList.length - 1, 1);
  let sI = 0;
  for (const m of supportList) {
    const slug = m.p.slug;
    const t = sI / supportN;
    const mid = wallContentMidpointPct(m.layoutSize);
    const phase = sI * 2.17 + hash01(slug, 300) * 4.1;
    let idealLeft =
      mid +
      Math.sin(phase) * (11 + t * 14) +
      (hash01(slug, 301 + sI) - 0.5) * 10;
    let idealTop =
      30 +
      (1 - Math.pow(1 - t, 1.35)) * 38 +
      Math.cos(phase * 0.88) * 7 +
      (hash01(slug, 302 + sI) - 0.5) * 9;

    const diag = diagonalBias(slug, sI);
    idealLeft += diag.dl;
    idealTop += diag.dt;

    const br = breathingPush(idealLeft, idealTop, slug);
    idealLeft += br.dl;
    idealTop += br.dt;

    idealLeft -= Math.max(0, idealLeft - (muralContentRightPct() - 16)) * 0.38;
    idealLeft = clampWallLeftPct(idealLeft, m.layoutSize, "support");
    idealTop = Math.max(16, Math.min(88, idealTop));

    const sepMul = 1.05 + (1 - t) * 0.22;
    let placedOne = false;
    for (let attempt = 0; attempt < 72 && !placedOne; attempt++) {
      let left =
        idealLeft +
        (hash01(slug, 400 + attempt) - 0.5) * (9 + attempt * 0.08);
      let top =
        idealTop +
        (hash01(slug, 500 + attempt) - 0.5) * (8 + attempt * 0.07);
      left = clampWallLeftPct(left, m.layoutSize, "support");
      top = Math.max(14, Math.min(91, top));
      if (!minSepOk(left, top, m.layoutSize, placed, sepMul, "support")) continue;
      const fin = finalizeWallPosition(
        left,
        top,
        m.layoutSize,
        placed,
        sepMul,
        "support",
        slug,
        14,
        91,
      );
      left = fin.left;
      top = fin.top;
      if (!minSepOk(left, top, m.layoutSize, placed, sepMul * 0.92, "support"))
        continue;
      placed.push({ left, top, size: m.layoutSize, role: "support", slug });
      const z =
        34 +
        Math.round((1 - t) * 16) +
        Math.round(hash01(slug, 606) * 5);
      out[m.idx] = {
        topPct: Math.round(top * 10) / 10,
        leftPct: Math.round(left * 10) / 10,
        width: widthForProjectSize(m.layoutSize),
        zIndex: Math.min(58, z),
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
      const mul = 0.62;
      for (let s = 0; s < 36; s++) {
        left += (hash01(slug, 700 + s) - 0.5) * 4.2;
        top += (hash01(slug, 750 + s) - 0.5) * 4.2;
        left = clampWallLeftPct(left, m.layoutSize, "support");
        top = Math.max(14, Math.min(91, top));
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
        14,
        91,
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
        zIndex: 30,
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
    const edge = hash01(slug, 900 + texI);
    let idealLeft =
      edge < 0.34
        ? UI_MARGIN_PCT + 6 + hash01(slug, 901) * 12
        : edge > 0.72
          ? muralContentRightPct() - 14 - hash01(slug, 902) * 10
          : wallContentMidpointPct(m.layoutSize) +
            (hash01(slug, 903) - 0.5) * 20;
    let idealTop =
      36 +
      hash01(slug, 904) * 48 +
      (hash01(slug, 905) - 0.35) * 12 +
      texI * 0.35;

    const diag = diagonalBias(slug, texI + 2000);
    idealLeft += diag.dl * 0.85;
    idealTop += diag.dt * 0.9;
    const br = breathingPush(idealLeft, idealTop, slug);
    idealLeft += br.dl;
    idealTop += br.dt;
    idealLeft = clampWallLeftPct(idealLeft, m.layoutSize, "texture");
    idealTop = Math.max(12, Math.min(93, idealTop));

    const sepMul = 0.58;
    let placedOne = false;
    for (let attempt = 0; attempt < 80 && !placedOne; attempt++) {
      let left =
        idealLeft +
        (hash01(slug, 910 + attempt) - 0.5) * (11 + attempt * 0.05);
      let top =
        idealTop +
        (hash01(slug, 960 + attempt) - 0.5) * (12 + attempt * 0.05);
      left = clampWallLeftPct(left, m.layoutSize, "texture");
      top = Math.max(11, Math.min(94, top));
      if (!minSepOk(left, top, m.layoutSize, placed, sepMul, "texture")) continue;
      const fin = finalizeWallPosition(
        left,
        top,
        m.layoutSize,
        placed,
        sepMul,
        "texture",
        slug,
        11,
        94,
      );
      left = fin.left;
      top = fin.top;
      if (!minSepOk(left, top, m.layoutSize, placed, sepMul * 0.88, "texture"))
        continue;
      placed.push({ left, top, size: m.layoutSize, role: "texture", slug });
      out[m.idx] = {
        topPct: Math.round(top * 10) / 10,
        leftPct: Math.round(left * 10) / 10,
        width: widthForProjectSize(m.layoutSize),
        zIndex: 14 + (texI % 6) + Math.round(hash01(slug, 999) * 8),
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
        zIndex: 12,
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
        topPct: 50,
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
