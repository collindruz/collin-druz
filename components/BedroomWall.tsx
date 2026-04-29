"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BedroomPoster,
  type PosterWallLayout,
} from "@/components/BedroomPoster";
import { CONTACT_EMAIL } from "@/lib/contact";
import {
  getYoutubeVideoId,
  type Project,
  type ProjectPriority,
  type ProjectSize,
} from "@/lib/projects";

/** Slot width by project size (feeds poster footprint; placement stays in BedroomWall). */
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

/** Higher = newer / more central priority (year + list order). */
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

/**
 * Half of the vw term in widthForProjectSize (approx. half poster width as % of viewport).
 * Extra slack accounts for translate(-50%), rotation, and ±hand offset px.
 */
const HALF_WIDTH_VW: Record<ProjectSize, number> = {
  xl: 13.2 / 2,
  lg: 11.2 / 2,
  md: 9.4 / 2,
  sm: 7.6 / 2,
};

/** Minimum space from viewport edge to poster’s outer extent (readable inset). */
const WALL_H_INSET_PCT = 5;
/** Reserved gutter for right-side project labels (desktop-first safety margin). */
const WALL_RIGHT_LABEL_GUTTER_PCT = 24;

/** Additional horizontal radius (~hand jitter vs narrow viewports). */
const WALL_HAND_SLACK_PCT = 2.6;

function effectiveHalfWidthPct(size: ProjectSize): number {
  return HALF_WIDTH_VW[size] + WALL_HAND_SLACK_PCT;
}

/** Keep poster center so the slab stays mostly on-canvas (intentional small edge peek only). */
function clampWallLeftPct(leftPct: number, size: ProjectSize): number {
  const hw = effectiveHalfWidthPct(size);
  const minC = WALL_H_INSET_PCT + hw;
  const maxC = 100 - WALL_H_INSET_PCT - WALL_RIGHT_LABEL_GUTTER_PCT - hw;
  return Math.min(maxC, Math.max(minC, leftPct));
}

/** Pull compositions that hug the left gutter back toward the mural center. */
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

/** Triangular anchor band — upper ~20–28% vertical, intentional breathing room. */
const ANCHOR_SLOT_BY_SLUG: Record<string, { left: number; top: number }> = {
  "doja-cat-gorgeous": { left: 50, top: 18.2 },
  "sabrina-carpenter-taste": { left: 35.8, top: 24.8 },
  "lil-dicky-hahaha-i-love-myself": { left: 64.2, top: 24.8 },
};

const HERO_OPTIONAL_SLOTS: Array<{ left: number; top: number }> = [
  { left: 23.5, top: 22.6 },
  { left: 76.5, top: 22.6 },
];

/** Curated importance: recency + priority + featured + size (for vertical gradient). */
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

/** Deterministic ±(10..20) px — casual hand placement. */
function handOffsetPx(slug: string, k: number, axis: 0 | 1): number {
  let h = k * 140973497 + axis * 7903991;
  for (let i = 0; i < slug.length; i++) {
    h = (h + slug.charCodeAt(i) * (i * 7 + axis + 2)) >>> 0;
  }
  const mag = 10 + (h % 11);
  const sign = (h >>> 5) & 1 ? 1 : -1;
  return sign * mag;
}

/** Hand tilt: −2deg .. +2deg. */
function rotateDegFor(slug: string, k: number): number {
  let h = k * 2654435761;
  for (let i = 0; i < slug.length; i++) {
    h = (h + slug.charCodeAt(i) * (i + 3)) >>> 0;
  }
  const t = (h % 1000) / 1000;
  return -2 + t * 4;
}

type Placed = { left: number; top: number; size: ProjectSize };

function minSepOk(
  left: number,
  top: number,
  size: ProjectSize,
  placed: Placed[],
  sepMul = 1,
): boolean {
  for (const q of placed) {
    const need = sepMin(size, q.size) * sepMul;
    const dx = (left - q.left) * 0.92;
    const dy = top - q.top;
    if (dx * dx + dy * dy < need * need) return false;
  }
  return true;
}

/** Separation tightens toward bottom: light overlap allowed only in dense band. */
function sepMulForTop(top: number): number {
  if (top < 39) return 1.22;
  if (top < 54) return 1.02;
  if (top < 64) return 0.84;
  return 0.62;
}

type WallMeta = { idx: number; p: Project; imp: number };

/** Mix sizes through fill order — sm/md interleave so smalls aren’t only at the end. */
function orderForFill(items: WallMeta[]): WallMeta[] {
  const buckets = new Map<ProjectSize, WallMeta[]>();
  for (const s of ["sm", "md", "lg", "xl"] as ProjectSize[]) {
    buckets.set(s, []);
  }
  for (const it of items) {
    buckets.get(it.p.size)!.push(it);
  }
  for (const arr of buckets.values()) {
    arr.sort((a, b) => b.imp - a.imp);
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

/** Candidate cloud: breathable upper-mid, then denser toward bottom + edge bleed. */
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

function pickHeroes(metas: WallMeta[]): WallMeta[] {
  if (metas.length <= 2) return metas.slice().sort((a, b) => b.imp - a.imp);

  const bySlug = new Map(metas.map((m) => [m.p.slug, m]));
  const keys: WallMeta[] = [];
  for (const slug of MANDATORY_HERO_SLUGS) {
    const m = bySlug.get(slug);
    if (m) keys.push(m);
  }
  const used = new Set(keys.map((k) => k.idx));
  const optionalMax = Math.min(2, Math.max(0, 5 - keys.length));
  if (optionalMax === 0) return keys;

  const candidates = metas
    .filter((m) => !used.has(m.idx))
    .filter(
      (m) =>
        m.p.category !== "Commercials" &&
        (m.p.category === "Music Videos" || m.p.category === "Narrative") &&
        (m.p.priority === "hero" || m.p.priority === "large"),
    )
    .sort((a, b) => b.imp - a.imp);

  return [...keys, ...candidates.slice(0, optionalMax)];
}

/**
 * Vertical density gradient: breathable hero band → tighter mid → dense bottom.
 */
function layoutsForProjects(projects: Project[]): PosterWallLayout[] {
  const n = projects.length;
  if (n === 0) return [];

  const metas: WallMeta[] = projects.map((p, idx) => ({
    idx,
    p,
    imp: importance(idx, p),
  }));

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

    left = clampWallLeftPct(left, it.p.size);
    top = Math.max(15, Math.min(isKeyAnchor ? 28.5 : 30, top));

    let tries = 0;
    while (tries < 40 && !minSepOk(left, top, it.p.size, placed, heroSepMul)) {
      left += (hash01(slug, tries + 11) - 0.5) * 2.4;
      top += (hash01(slug, tries + 22) - 0.5) * 1.8;
      left = clampWallLeftPct(left, it.p.size);
      tries++;
    }

    left = clampWallLeftPct(left, it.p.size);
    placed.push({ left, top, size: it.p.size });
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
      width: widthForProjectSize(it.p.size),
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
    rest.slice().sort((a, b) => b.imp - a.imp),
  );
  const candidates = generateCandidates(n * 7 + 100);

  let fillI = 0;
  for (const it of fillOrder) {
    const impN = maxImp > 0 ? it.imp / maxImp : 0.5;
    let downNudge = 0;
    if (
      (it.p.size === "lg" || it.p.size === "xl") &&
      it.imp < medImp &&
      hash01(it.p.slug, 77) < 0.52
    ) {
      downNudge = 9 + hash01(it.p.slug, 88) * 10;
    }

    const vBreak =
      (hash01(it.p.slug, 12) - 0.5) * (5 + (1 - impN) * 10 + fillI * 0.06);
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
      (fillI % 5) * 0.6;
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

      left = clampWallLeftPct(left, it.p.size);
      top = Math.max(13.5, Math.min(81, top));

      const mul = sepMulForTop(top) * 0.98 + zoneMul * 0.02;

      if (minSepOk(left, top, it.p.size, placed, mul)) {
        placed.push({ left, top, size: it.p.size });
        const ox = handOffsetPx(it.p.slug, seq, 0);
        const oy = handOffsetPx(it.p.slug, seq, 1);
        const z =
          11 +
          Math.round(impN * 12) +
          (it.p.priority === "hero" ? 18 : it.p.priority === "large" ? 7 : 0) +
          (it.p.size === "sm" ? 0 : 1);

        out[it.idx] = {
          topPct: Math.round(top * 10) / 10,
          leftPct: Math.round(left * 10) / 10,
          width: widthForProjectSize(it.p.size),
          zIndex: Math.min(74, z + (top > 64 ? fillI % 3 : 0)),
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
        left = clampWallLeftPct(left, it.p.size);
        top = Math.max(13.5, Math.min(81, top));
        const mul = sepMulForTop(top);
        if (minSepOk(left, top, it.p.size, placed, mul)) {
          placed.push({ left, top, size: it.p.size });
          const ox = handOffsetPx(it.p.slug, seq, 0);
          const oy = handOffsetPx(it.p.slug, seq, 1);
          const z =
            10 +
            Math.round(impN * 10) +
            (it.p.priority === "hero" ? 16 : 0);

          out[it.idx] = {
            topPct: Math.round(top * 10) / 10,
            leftPct: Math.round(left * 10) / 10,
            width: widthForProjectSize(it.p.size),
            zIndex: Math.min(72, z),
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
        left = clampWallLeftPct(left, it.p.size);
        top = Math.max(13.5, Math.min(81, top));
        if (minSepOk(left, top, it.p.size, placed, mul)) break;
      }
      placed.push({ left, top, size: it.p.size });
      const ox = handOffsetPx(it.p.slug, seq, 0);
      const oy = handOffsetPx(it.p.slug, seq, 1);
      out[it.idx] = {
        topPct: Math.round(top * 10) / 10,
        leftPct: Math.round(left * 10) / 10,
        width: widthForProjectSize(it.p.size),
        zIndex: Math.min(70, 9 + fillI + (top > 62 ? 2 : 0)),
        rotateDeg: Math.round(rotateDegFor(it.p.slug, seq) * 100) / 100,
        offsetXPx: ox,
        offsetYPx: oy,
      };
      seq++;
      fillI++;
    }
  }

  return out;
}

type Props = {
  projects: Project[];
};

function posterPreloadUrl(p: Project): string | null {
  const yt = p.youtubeId ?? getYoutubeVideoId(p.videoUrl);
  if (yt) return `https://img.youtube.com/vi/${yt}/hqdefault.jpg`;
  const th = p.thumbnail;
  if (typeof th === "string") return th;
  return th.src ?? null;
}

export function BedroomWall({ projects }: Props) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorActive, setCursorActive] = useState(false);
  const [cursorEnabled, setCursorEnabled] = useState(false);
  const [cursorOverImage, setCursorOverImage] = useState(false);
  const mailHref = `mailto:${CONTACT_EMAIL}`;
  const stripRef = useRef<HTMLDivElement>(null);
  const wallLayouts = useMemo(
    () => layoutsForProjects(projects),
    [projects],
  );
  const projectsByYearDesc = useMemo(() => {
    return projects
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
  }, [projects]);

  useEffect(() => {
    const links: HTMLLinkElement[] = [];
    const seen = new Set<string>();
    for (const p of projects.slice(0, 12)) {
      const href = posterPreloadUrl(p);
      if (!href || seen.has(href)) continue;
      seen.add(href);
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = href;
      document.head.appendChild(link);
      links.push(link);
    }
    return () => {
      for (const L of links) L.remove();
    };
  }, [projects]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (!t.closest("[data-wall-poster]")) {
        setOpenSlug(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(pointer: fine)");
    const apply = () => setCursorEnabled(media.matches);
    apply();
    media.addEventListener?.("change", apply);
    return () => media.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    if (!cursorEnabled) return;
    document.body.classList.add("analog-cursor-active");
    return () => document.body.classList.remove("analog-cursor-active");
  }, [cursorEnabled]);

  useEffect(() => {
    if (!cursorEnabled) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      setCursorPos({ x: e.clientX, y: e.clientY });
      setCursorVisible(true);
      const target = e.target;
      if (target instanceof Element) {
        setCursorOverImage(Boolean(target.closest("[data-wall-poster]")));
      } else {
        setCursorOverImage(false);
      }
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") setCursorActive(true);
    };
    const onUp = () => setCursorActive(false);
    const onLeave = () => setCursorVisible(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("blur", onLeave);
    document.addEventListener("mouseleave", onLeave);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [cursorEnabled]);

  useEffect(() => {
    if (!openSlug) return;
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>(`[data-video-slug="${openSlug}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [openSlug]);

  return (
    <div className="bedroom-wall relative z-0 h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-[100vw] overflow-hidden bg-[#e6e8e4] text-charcoal/60">
      <div
        className="bedroom-plaster-wall pointer-events-none absolute inset-0 z-0"
        aria-hidden
      />

      <p className="pointer-events-none absolute left-[3%] top-[2.5%] z-[30] max-w-[9rem] font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-charcoal/30 md:left-[4%] md:top-[3%] md:text-[11px]">
        Collin Druz
      </p>

      <p className="pointer-events-auto absolute bottom-[4%] left-[4%] z-[30] max-w-[14rem] -rotate-[0.4deg] font-sans text-[10px] font-normal tracking-[0.06em] text-charcoal/26 md:bottom-[5%] md:left-[5%] md:text-[11px]">
        <a
          href={mailHref}
          className="border-b border-transparent transition-colors duration-[900ms] hover:border-charcoal/12 hover:text-charcoal/34"
        >
          {CONTACT_EMAIL}
        </a>
      </p>

      <aside
        className="bedroom-project-rail pointer-events-none absolute right-[2.2%] top-[2.5%] z-[110]"
        aria-label="Project index"
      >
        <div ref={stripRef} className="bedroom-project-rail__scroll">
          {projectsByYearDesc.map((project) => (
            <button
              key={project.slug}
              type="button"
              data-video-slug={project.slug}
              className={`bedroom-project-rail__item ${openSlug === project.slug ? "is-active" : ""}`}
              onClick={() =>
                setOpenSlug((cur) => (cur === project.slug ? null : project.slug))
              }
              title={project.title}
            >
              <span className="bedroom-project-rail__year">{project.year}</span>
              <span className="bedroom-project-rail__title">{project.title}</span>
            </button>
          ))}
        </div>
      </aside>

      {projects.map((project, i) => (
        <BedroomPoster
          key={project.slug}
          project={project}
          wallLayout={wallLayouts[i]!}
          open={openSlug === project.slug}
          onToggle={() => {
            setOpenSlug((cur) => (cur === project.slug ? null : project.slug));
          }}
        />
      ))}

      {cursorEnabled ? (
        <div
          className={`bedroom-analog-cursor ${cursorVisible ? "is-visible" : ""} ${cursorActive ? "is-active" : ""} ${cursorOverImage ? "is-over-image" : ""}`}
          style={{ transform: `translate3d(${cursorPos.x}px, ${cursorPos.y}px, 0)` }}
          aria-hidden
        >
          <span className="bedroom-analog-cursor__ring bedroom-analog-cursor__ring--outer" />
          <span className="bedroom-analog-cursor__ring bedroom-analog-cursor__ring--inner" />
          <span className="bedroom-analog-cursor__cross bedroom-analog-cursor__cross--v" />
          <span className="bedroom-analog-cursor__cross bedroom-analog-cursor__cross--h" />
          <span className="bedroom-analog-cursor__dot" />
        </div>
      ) : null}
    </div>
  );
}
