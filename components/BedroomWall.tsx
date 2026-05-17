"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { BedroomPoster } from "@/components/BedroomPoster";
import type { PosterWallLayout } from "@/lib/bedroomWallLayout";
import { CONTACT_EMAIL } from "@/lib/contact";
import type { Project } from "@/lib/projects";

type Props = {
  projects: Project[];
  wallLayouts: PosterWallLayout[];
  projectsByYearDesc: Project[];
};

const PosterWallCell = memo(function PosterWallCell({
  project,
  wallLayout,
  open,
  wallDimmed,
  railHoverActive,
  pointerFine,
  onTogglePoster,
}: {
  project: Project;
  wallLayout: PosterWallLayout;
  open: boolean;
  wallDimmed: boolean;
  railHoverActive: boolean;
  pointerFine: boolean;
  onTogglePoster: (slug: string) => void;
}) {
  const onToggle = useCallback(() => {
    onTogglePoster(project.slug);
  }, [project.slug, onTogglePoster]);

  return (
    <BedroomPoster
      project={project}
      wallLayout={wallLayout}
      open={open}
      wallDimmed={wallDimmed}
      railHoverActive={railHoverActive}
      pointerFine={pointerFine}
      onToggle={onToggle}
    />
  );
});
PosterWallCell.displayName = "PosterWallCell";

export function BedroomWall({
  projects,
  wallLayouts,
  projectsByYearDesc,
}: Props) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [hoverSlug, setHoverSlug] = useState<string | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [coarsePointer, setCoarsePointer] = useState(false);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [cursorVisible, setCursorVisible] = useState(false);
  const [cursorActive, setCursorActive] = useState(false);
  const [cursorEnabled, setCursorEnabled] = useState(false);
  const [cursorOverImage, setCursorOverImage] = useState(false);
  const mailHref = `mailto:${CONTACT_EMAIL}`;
  const stripRef = useRef<HTMLDivElement>(null);
  const mobileSheetOpenRef = useRef(false);

  useEffect(() => {
    mobileSheetOpenRef.current = mobileSheetOpen;
  }, [mobileSheetOpen]);

  const onTogglePoster = useCallback((slug: string) => {
    setOpenSlug((cur) => (cur === slug ? null : slug));
  }, []);

  const pickFromSheet = useCallback((slug: string) => {
    setOpenSlug((cur) => (cur === slug ? null : slug));
    setMobileSheetOpen(false);
  }, []);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (
        t.closest("[data-project-sheet]") ||
        t.closest("[data-mobile-index-trigger]")
      ) {
        return;
      }
      if (
        mobileSheetOpenRef.current &&
        t.closest(".bedroom-mobile-sheet")
      ) {
        return;
      }
      if (!t.closest("[data-wall-poster]")) {
        setOpenSlug(null);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const coarseMq = window.matchMedia("(pointer: coarse)");
    const fineMq = window.matchMedia("(pointer: fine)");
    const applyCoarse = () => setCoarsePointer(coarseMq.matches);
    const applyFine = () => setCursorEnabled(fineMq.matches);
    applyCoarse();
    applyFine();
    coarseMq.addEventListener?.("change", applyCoarse);
    fineMq.addEventListener?.("change", applyFine);
    return () => {
      coarseMq.removeEventListener?.("change", applyCoarse);
      fineMq.removeEventListener?.("change", applyFine);
    };
  }, []);

  useEffect(() => {
    if (!mobileSheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileSheetOpen]);

  useEffect(() => {
    if (!mobileSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileSheetOpen]);

  useEffect(() => {
    if (!cursorEnabled) return;
    document.body.classList.add("analog-cursor-active");
    return () => document.body.classList.remove("analog-cursor-active");
  }, [cursorEnabled]);

  useEffect(() => {
    if (!cursorEnabled) return;
    let raf: number | null = null;
    const pending = { x: 0, y: 0 };
    let lastTarget: Element | null = null;

    const flush = () => {
      raf = null;
      setCursorPos({ x: pending.x, y: pending.y });
      setCursorOverImage(
        lastTarget ? Boolean(lastTarget.closest("[data-wall-poster]")) : false,
      );
      setCursorVisible(true);
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      pending.x = e.clientX;
      pending.y = e.clientY;
      lastTarget = e.target instanceof Element ? e.target : null;
      if (raf === null) raf = requestAnimationFrame(flush);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") setCursorActive(true);
    };
    const onUp = () => setCursorActive(false);
    const onLeave = () => {
      setCursorVisible(false);
      setCursorOverImage(false);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("blur", onLeave);
    document.addEventListener("mouseleave", onLeave);

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", onLeave);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, [cursorEnabled]);

  useEffect(() => {
    if (!openSlug) return;
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches) {
      return;
    }
    const strip = stripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>(`[data-video-slug="${openSlug}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [openSlug]);

  const railHoverBoost = !coarsePointer && hoverSlug != null;

  return (
    <div className="bedroom-wall relative z-0 h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-[100vw] overflow-hidden bg-[#e6e8e4] text-charcoal/60">
      <div
        className="bedroom-plaster-wall pointer-events-none absolute inset-0 z-0"
        aria-hidden
      />

      <a
        href={mailHref}
        aria-label={`Email ${CONTACT_EMAIL}`}
        className="pointer-events-auto absolute left-[3%] top-[2.5%] z-[118] max-w-[9rem] font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-charcoal/30 outline-none transition-colors duration-500 hover:text-black focus-visible:text-black md:left-[4%] md:top-[3%] md:text-[11px]"
      >
        Collin Druz
      </a>

      <div className="pointer-events-none absolute bottom-[4%] left-[4%] z-[118] max-w-[16rem] -rotate-[0.4deg] font-sans text-[10px] font-normal tracking-[0.06em] text-charcoal/26 md:bottom-[5%] md:left-[5%] md:text-[11px]">
        <a
          href={mailHref}
          aria-label={`Email ${CONTACT_EMAIL}`}
          className="pointer-events-auto border-b border-transparent text-inherit outline-none transition-colors duration-500 hover:border-black/25 hover:text-black focus-visible:border-black/25 focus-visible:text-black"
        >
          {CONTACT_EMAIL}
        </a>
        <p className="mt-2 max-w-[14rem] text-[9px] leading-snug tracking-[0.05em] text-charcoal/20 md:text-[10px] md:tracking-[0.055em]">
          interact. play. create.
        </p>
      </div>

      <button
        type="button"
        data-mobile-index-trigger
        className="pointer-events-auto absolute bottom-[max(3%,env(safe-area-inset-bottom))] right-[3.5%] z-[125] min-[821px]:hidden font-sans text-[9px] font-medium uppercase tracking-[0.18em] text-charcoal/38"
        onClick={() => setMobileSheetOpen(true)}
      >
        Index
      </button>

      <aside
        className="bedroom-project-rail pointer-events-none absolute right-[1.35%] top-[2.5%] z-[110] hidden min-[821px]:block"
        aria-label="Project index"
      >
        <div ref={stripRef} className="bedroom-project-rail__scroll">
          {projectsByYearDesc.map((project) => (
            <button
              key={project.slug}
              type="button"
              data-video-slug={project.slug}
              className={`bedroom-project-rail__item ${openSlug === project.slug ? "is-active" : ""}`}
              onClick={() => onTogglePoster(project.slug)}
              onMouseEnter={() => setHoverSlug(project.slug)}
              onMouseLeave={() => setHoverSlug((cur) => (cur === project.slug ? null : cur))}
              onFocus={() => setHoverSlug(project.slug)}
              onBlur={() => setHoverSlug((cur) => (cur === project.slug ? null : cur))}
              title={
                project.director
                  ? `${project.title} · Dir. ${project.director}`
                  : project.title
              }
            >
              <span className="bedroom-project-rail__year">{project.year}</span>
              <span className="bedroom-project-rail__copy">
                <span className="bedroom-project-rail__title">{project.title}</span>
                {project.director ? (
                  <span className="bedroom-project-rail__director">
                    Dir. {project.director}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div
        className={`bedroom-mobile-sheet min-[821px]:hidden ${mobileSheetOpen ? "is-open" : ""}`}
        aria-hidden={!mobileSheetOpen}
      >
        <button
          type="button"
          className="bedroom-mobile-sheet__backdrop"
          aria-label="Close index"
          onClick={() => setMobileSheetOpen(false)}
        />
        <div
          data-project-sheet
          className="bedroom-mobile-sheet__panel"
          role="dialog"
          aria-modal="true"
          aria-label="Project index"
        >
          <div className="bedroom-mobile-sheet__header">
            <p className="bedroom-mobile-sheet__title">Index</p>
            <button
              type="button"
              className="bedroom-mobile-sheet__close"
              aria-label="Close"
              onClick={() => setMobileSheetOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="bedroom-mobile-sheet__scroll">
            {projectsByYearDesc.map((project) => (
              <button
                key={`sheet-${project.slug}`}
                type="button"
                data-video-slug={project.slug}
                className={`bedroom-mobile-sheet__item ${openSlug === project.slug ? "is-active" : ""}`}
                onClick={() => pickFromSheet(project.slug)}
              >
                <span className="bedroom-mobile-sheet__year">{project.year}</span>
                <span className="bedroom-mobile-sheet__copy">
                  <span className="bedroom-mobile-sheet__title">{project.title}</span>
                  {project.director ? (
                    <span className="bedroom-mobile-sheet__director">
                      Dir. {project.director}
                    </span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {openSlug ? (
        <div
          className="pointer-events-none absolute inset-0 z-[85]"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 95% 72% at 50% 38%, transparent 0%, rgba(14,16,20,0.18) 52%, rgba(8,10,14,0.48) 100%)",
          }}
        />
      ) : null}

      {projects.map((project, i) => (
        <PosterWallCell
          key={project.slug}
          project={project}
          wallLayout={wallLayouts[i]!}
          open={openSlug === project.slug}
          wallDimmed={openSlug !== null && openSlug !== project.slug}
          railHoverActive={railHoverBoost && hoverSlug === project.slug}
          pointerFine={!coarsePointer}
          onTogglePoster={onTogglePoster}
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
