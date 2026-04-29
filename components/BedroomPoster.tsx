"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { StaticImageData } from "next/image";
import type { YTInstance } from "@/lib/ytTypes";
import {
  getVideoEmbed,
  getVimeoVideoId,
  getYoutubeVideoId,
  type Project,
} from "@/lib/projects";
import { loadYouTubeIframeApi } from "@/lib/youtubeIframeApi";

const MOVE_THRESH_MOUSE = 8;
const MOVE_THRESH_TOUCH_DRAG = 14;
const LONG_PRESS_MS = 420;
/** If vertical delta dominates by this ratio, cancel touch gesture (page scroll). */
const TOUCH_SCROLL_DOMINANCE = 1.28;

const VIEW_MARGIN = 22;
/** Keep dragged poster shell inside the fixed viewport. */
const DRAG_VIEW_MARGIN = 14;

function clampShellToViewport(shell: HTMLElement, margin: number) {
  const r = shell.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let dx = 0;
  let dy = 0;
  if (r.left < margin) dx = margin - r.left;
  const right = r.right + dx;
  if (right > vw - margin) dx += vw - margin - right;
  if (r.top < margin) dy = margin - r.top;
  const bottom = r.bottom + dy;
  if (bottom > vh - margin) dy += vh - margin - bottom;
  return { dx, dy };
}

function tearClipPath(slug: string): string {
  const nib = (seed: number) => {
    let v = seed * 17;
    for (let i = 0; i < slug.length; i++) {
      v = (v + slug.charCodeAt(i) * (i + 5)) % 251;
    }
    return (v % 13) * 0.07;
  };
  const a = nib(1);
  const b = nib(2);
  const c = nib(3);
  const d = nib(4);
  const e = nib(5);
  const f = nib(6);
  const g = nib(7);
  const h = nib(8);
  return `polygon(
    ${a}% ${b}%,
    ${100 - c}% ${d}%,
    ${100 - e}% ${100 - f}%,
    ${g}% ${100 - h}%
  )`;
}

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

type Props = {
  project: Project;
  wallLayout: PosterWallLayout;
  open: boolean;
  railHoverActive: boolean;
  onToggle: () => void;
};

function posterStillSrc(
  project: Project,
  embed: ReturnType<typeof getVideoEmbed>,
  ytId: string | null,
): string {
  if (embed.kind === "youtube" && ytId) {
    return `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  }
  const th: string | StaticImageData = project.thumbnail;
  return typeof th === "string" ? th : th.src;
}

function tryUnmutePlay(pl: YTInstance) {
  try {
    pl.unMute();
    pl.playVideo();
  } catch {
    /* ignore */
  }
}

type DragSession = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  dragging: boolean;
  pointerType: string;
  longPressTimer: ReturnType<typeof setTimeout> | null;
};

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function BedroomPosterInner({
  project,
  wallLayout,
  open,
  railHoverActive,
  onToggle,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const openCardRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const ytShellRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<YTInstance | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const dragLiveRef = useRef({ x: 0, y: 0 });
  const dragRafRef = useRef<number | null>(null);

  const [ytReady, setYtReady] = useState(false);
  const [ytSoundBlocked, setYtSoundBlocked] = useState(false);
  /** Deferred one frame after open so no iframe/video mounts during the opening commit. */
  const [embedArmed, setEmbedArmed] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [promote, setPromote] = useState({ nx: 0, ny: 0 });
  const [resizeTick, setResizeTick] = useState(0);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);

  const embed = getVideoEmbed(project.videoUrl);
  const ytId =
    project.youtubeId ?? getYoutubeVideoId(project.videoUrl);
  const edgeClip = useMemo(() => tearClipPath(project.slug), [project.slug]);

  const edgeStyle: CSSProperties = {
    clipPath: edgeClip,
    WebkitClipPath: edgeClip,
  };

  const vimeoId =
    embed.kind === "vimeo"
      ? (project.vimeoId ?? getVimeoVideoId(project.videoUrl))
      : null;

  const stillUrl = useMemo(
    () => posterStillSrc(project, embed, ytId),
    [embed, project, ytId],
  );

  const detachWindowListeners = useRef(() => {});

  const resumePlayback = useCallback(() => {
    const pl = ytPlayerRef.current;
    if (pl && ytReady) {
      tryUnmutePlay(pl);
    }
    const v = videoRef.current;
    if (v && embed.kind === "file") {
      v.muted = false;
      void v.play().catch(() => {});
    }
  }, [embed.kind, ytReady]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      if (!cancelled) setEmbedArmed(true);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
      setEmbedArmed(false);
    };
  }, [open]);

  const loadYt = Boolean(open && embedArmed && ytId);

  useEffect(() => {
    if (!isDragging) {
      dragLiveRef.current = dragOffset;
    }
  }, [dragOffset, isDragging]);

  const scheduleDragOffsetFlush = useCallback(() => {
    if (dragRafRef.current !== null) return;
    dragRafRef.current = requestAnimationFrame(() => {
      dragRafRef.current = null;
      if (!sessionRef.current?.dragging) return;
      setDragOffset({
        x: dragLiveRef.current.x,
        y: dragLiveRef.current.y,
      });
    });
  }, []);

  const endDragSession = useCallback(() => {
    if (dragRafRef.current !== null) {
      cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = null;
    }
    detachWindowListeners.current();
    const s = sessionRef.current;
    if (s?.longPressTimer) clearTimeout(s.longPressTimer);
    sessionRef.current = null;
    setIsDragging(false);
  }, []);

  const armDragging = useCallback(() => {
    setIsDragging(true);
    const shell = shellRef.current;
    if (shell && document.activeElement === shell) {
      shell.blur();
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onResize = () => setResizeTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = openCardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let t: number | undefined;
    const ro = new ResizeObserver(() => {
      if (t !== undefined) window.clearTimeout(t);
      t = window.setTimeout(() => setResizeTick((n) => n + 1), 80) as number;
    });
    ro.observe(el);
    return () => {
      if (t !== undefined) window.clearTimeout(t);
      ro.disconnect();
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      queueMicrotask(() => setPromote({ nx: 0, ny: 0 }));
      return;
    }

    const card = openCardRef.current;
    if (!card) return;

    const margin = VIEW_MARGIN;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const marginX = Math.max(margin, Math.round(vw * 0.042));

    const r = card.getBoundingClientRect();
    const baseLeft = r.left - promote.nx;
    const baseRight = r.right - promote.nx;
    const baseTop = r.top - promote.ny;
    const baseBottom = r.bottom - promote.ny;

    let nx = 0;
    let ny = 0;
    if (baseLeft < marginX) nx = marginX - baseLeft;
    if (baseRight > vw - marginX) nx += vw - marginX - baseRight;
    if (baseTop < margin) ny = margin - baseTop;
    if (baseBottom > vh - margin) ny += vh - margin - baseBottom;

    queueMicrotask(() => {
      setPromote((prev) =>
        prev.nx === nx && prev.ny === ny ? prev : { nx, ny },
      );
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- promote values read to strip offset; deps open + resizeTick only */
  }, [open, resizeTick]);

  useEffect(() => {
    if (!ytId || !loadYt) return;
    let alive = true;
    let player: YTInstance | null = null;

    const shellPixelSize = () => {
      const el = ytShellRef.current;
      if (!el) return { w: 640, h: 360 };
      const w = Math.max(200, Math.round(el.offsetWidth));
      const h = Math.max(200, Math.round(el.offsetHeight));
      return w >= 8 && h >= 8 ? { w, h } : { w: 640, h: 360 };
    };

    const run = async () => {
      await loadYouTubeIframeApi();
      if (!alive) return;
      for (let i = 0; i < 4 && (!mountRef.current || !ytShellRef.current); i++) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      if (!alive || !mountRef.current) return;

      let { w, h } = shellPixelSize();
      if (w === 640 && h === 360) {
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (!alive || !mountRef.current) return;
        ({ w, h } = shellPixelSize());
      }

      player = new window.YT.Player(mountRef.current, {
        videoId: ytId,
        width: w,
        height: h,
        playerVars: {
          autoplay: 1,
          mute: 1,
          controls: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          loop: 1,
          playlist: ytId,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          cc_load_policy: 3,
        },
        events: {
          onReady: (e) => {
            if (!alive) return;
            ytPlayerRef.current = e.target;
            setYtReady(true);
            const pl = e.target;
            try {
              const next = shellPixelSize();
              pl.setSize?.(next.w, next.h);
            } catch {
              /* ignore */
            }
            tryUnmutePlay(pl);
            window.setTimeout(() => tryUnmutePlay(pl), 80);
            window.setTimeout(() => tryUnmutePlay(pl), 240);
          },
          onStateChange: (e) => {
            if (!alive) return;
            if (e.data === 1) {
              tryUnmutePlay(e.target);
              try {
                const pl = e.target;
                setYtSoundBlocked(
                  typeof pl.isMuted === "function" ? pl.isMuted() : false,
                );
              } catch {
                setYtSoundBlocked(false);
              }
            }
          },
        },
      });
    };

    void run();

    return () => {
      alive = false;
      setYtReady(false);
      setYtSoundBlocked(false);
      ytPlayerRef.current = null;
      try {
        player?.pauseVideo();
        player?.mute();
        player?.destroy();
      } catch {
        /* ignore */
      }
    };
  }, [ytId, loadYt]);

  useEffect(() => {
    const pl = ytPlayerRef.current;
    const shell = ytShellRef.current;
    if (!open || !ytReady || !pl || !shell) return;

    const sync = () => {
      const w = Math.max(200, Math.round(shell.offsetWidth));
      const h = Math.max(200, Math.round(shell.offsetHeight));
      try {
        pl.setSize?.(w, h);
      } catch {
        /* ignore */
      }
    };

    sync();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => sync());
    ro.observe(shell);
    return () => ro.disconnect();
  }, [open, ytReady, ytId]);

  useEffect(() => {
    const pl = ytPlayerRef.current;
    if (!pl || !ytReady || !open) return;
    tryUnmutePlay(pl);
  }, [ytReady, open]);

  useEffect(() => {
    if (!open || !ytReady) return;
    const id = requestAnimationFrame(() => setResizeTick((n) => n + 1));
    return () => cancelAnimationFrame(id);
  }, [open, ytReady]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || embed.kind !== "file" || !open || !embedArmed) return;
    v.muted = true;
    void v.play().catch(() => {});
  }, [embed.kind, embedArmed, open]);

  useEffect(() => {
    if (!open) {
      setPlaybackTime(0);
      setPlaybackDuration(0);
      setIsScrubbing(false);
      return;
    }

    if (embed.kind === "file") {
      const v = videoRef.current;
      if (!v) return;
      const sync = () => {
        if (isScrubbing) return;
        setPlaybackTime(v.currentTime || 0);
        setPlaybackDuration(v.duration || 0);
      };
      sync();
      v.addEventListener("timeupdate", sync);
      v.addEventListener("loadedmetadata", sync);
      v.addEventListener("durationchange", sync);
      return () => {
        v.removeEventListener("timeupdate", sync);
        v.removeEventListener("loadedmetadata", sync);
        v.removeEventListener("durationchange", sync);
      };
    }

    if (embed.kind === "youtube" && ytReady) {
      const pl = ytPlayerRef.current;
      if (!pl) return;
      const id = window.setInterval(() => {
        try {
          const current = pl.getCurrentTime?.() ?? 0;
          const dur = pl.getDuration?.() ?? 0;
          if (!isScrubbing) {
            setPlaybackTime(current);
            setPlaybackDuration(dur);
          }
          setYtSoundBlocked(
            typeof pl.isMuted === "function" ? pl.isMuted() : false,
          );
        } catch {
          setYtSoundBlocked(false);
        }
      }, 250);
      return () => clearInterval(id);
    }
  }, [embed.kind, isScrubbing, open, ytReady]);

  const handleScrub = useCallback(
    (nextRaw: string) => {
      const next = Number(nextRaw);
      if (!Number.isFinite(next)) return;
      setPlaybackTime(next);
      if (embed.kind === "file") {
        const v = videoRef.current;
        if (v) v.currentTime = next;
        return;
      }
      if (embed.kind === "youtube" && ytReady) {
        const pl = ytPlayerRef.current;
        try {
          pl?.seekTo?.(next, true);
        } catch {
          /* ignore */
        }
      }
    },
    [embed.kind, ytReady],
  );

  useEffect(() => {
    if (!isScrubbing) return;
    const end = () => setIsScrubbing(false);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [isScrubbing]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || embed.kind !== "file" || !open || !embedArmed) return;
    return () => {
      v.pause();
      v.muted = true;
    };
  }, [embed.kind, embedArmed, open]);

  useEffect(() => {
    const onResize = () => {
      requestAnimationFrame(() => {
        const shell = shellRef.current;
        if (!shell) return;
        const { dx, dy } = clampShellToViewport(shell, DRAG_VIEW_MARGIN);
        if (dx !== 0 || dy !== 0) {
          setDragOffset((p) => ({ x: p.x + dx, y: p.y + dy }));
        }
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerMoveWindow = useCallback((e: PointerEvent) => {
    const s = sessionRef.current;
    if (!s || e.pointerId !== s.pointerId) return;

    const dx = e.clientX - s.startClientX;
    const dy = e.clientY - s.startClientY;
    const dist = Math.hypot(dx, dy);

    if (e.pointerType === "touch") {
      if (!s.dragging) {
        if (s.longPressTimer != null && dist >= 10) {
          const vDominant =
            Math.abs(dy) > Math.abs(dx) * TOUCH_SCROLL_DOMINANCE;
          if (vDominant) {
            clearTimeout(s.longPressTimer);
            s.longPressTimer = null;
            endDragSession();
            return;
          }
        }

        const horizontalIntent =
          Math.abs(dx) >= MOVE_THRESH_TOUCH_DRAG &&
          Math.abs(dx) >= Math.abs(dy) * 0.92;

        if (horizontalIntent && s.longPressTimer != null) {
          clearTimeout(s.longPressTimer);
          s.longPressTimer = null;
          dragLiveRef.current = { x: s.originX + dx, y: s.originY + dy };
          s.dragging = true;
          armDragging();
          try {
            shellRef.current?.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          scheduleDragOffsetFlush();
        }
      }

      if (s.dragging) {
        e.preventDefault();
        dragLiveRef.current = { x: s.originX + dx, y: s.originY + dy };
        scheduleDragOffsetFlush();
      }
      return;
    }

    if (e.pointerType === "mouse" || e.pointerType === "pen") {
      if (!s.dragging && dist >= MOVE_THRESH_MOUSE) {
        dragLiveRef.current = { x: s.originX + dx, y: s.originY + dy };
        s.dragging = true;
        armDragging();
        try {
          shellRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        scheduleDragOffsetFlush();
      }
      if (s.dragging) {
        dragLiveRef.current = { x: s.originX + dx, y: s.originY + dy };
        scheduleDragOffsetFlush();
      }
    }
  }, [armDragging, endDragSession, scheduleDragOffsetFlush]);

  const onPointerUpWindow = useCallback(
    (e: PointerEvent) => {
      const s = sessionRef.current;
      if (!s || e.pointerId !== s.pointerId) return;

      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }

      if (s.longPressTimer) {
        clearTimeout(s.longPressTimer);
        s.longPressTimer = null;
      }

      try {
        shellRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      const wasDrag = s.dragging;
      if (wasDrag) {
        setDragOffset({
          x: dragLiveRef.current.x,
          y: dragLiveRef.current.y,
        });
        requestAnimationFrame(() => {
          const shell = shellRef.current;
          if (!shell) return;
          const { dx, dy } = clampShellToViewport(shell, DRAG_VIEW_MARGIN);
          if (dx !== 0 || dy !== 0) {
            setDragOffset((p) => ({ x: p.x + dx, y: p.y + dy }));
          }
        });
      }
      endDragSession();

      if (!wasDrag) {
        if (open) {
          resumePlayback();
          return;
        }
        onToggle();
      }
    },
    [endDragSession, onToggle, open, resumePlayback],
  );

  const onPointerDownCapture = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (sessionRef.current) return;

      const origin = dragOffset;
      const session: DragSession = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originX: origin.x,
        originY: origin.y,
        dragging: false,
        pointerType: e.pointerType,
        longPressTimer: null,
      };

      if (e.pointerType === "touch") {
        session.longPressTimer = setTimeout(() => {
          const cur = sessionRef.current;
          if (!cur || cur.pointerId !== session.pointerId) return;
          cur.longPressTimer = null;
          cur.dragging = true;
          dragLiveRef.current = { x: cur.originX, y: cur.originY };
          armDragging();
          try {
            shellRef.current?.setPointerCapture(cur.pointerId);
          } catch {
            /* ignore */
          }
          scheduleDragOffsetFlush();
        }, LONG_PRESS_MS);
      }

      sessionRef.current = session;

      const move = (ev: PointerEvent) => onPointerMoveWindow(ev);
      const up = (ev: PointerEvent) => onPointerUpWindow(ev);

      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);

      detachWindowListeners.current = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        detachWindowListeners.current = () => {};
      };
    },
    [dragOffset, armDragging, onPointerMoveWindow, onPointerUpWindow, scheduleDragOffsetFlush],
  );

  useEffect(() => () => endDragSession(), [endDragSession]);

  const videoBlock = (() => {
    if (!open) return null;

    const clickVeil = (
      <div
        className="pointer-events-none absolute inset-0 z-20 cursor-pointer bg-transparent"
        aria-hidden
      />
    );

    const openThumbHold = (
      <div className="bedroom-yt-embed-root w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element -- native lazy load; avoid N× /_next/image optimizer calls on the wall */}
        <img
          src={stillUrl}
          alt=""
          className="absolute inset-0 z-0 h-full w-full object-cover [transform:none]"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
        />
      </div>
    );

    if (!embedArmed) {
      return openThumbHold;
    }

    if (embed.kind === "file") {
      return (
        <div className="bedroom-open-media-play">
          <video
            ref={videoRef}
            src={embed.src}
            className="pointer-events-none relative z-0 box-border block h-auto w-full max-w-full object-contain bg-transparent [transform:none]"
            playsInline
            loop
            controls={false}
            preload="none"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
          />
          {clickVeil}
        </div>
      );
    }

    if (embed.kind === "youtube" && ytId) {
      return (
        <div
          ref={ytShellRef}
          className={`bedroom-yt-embed-root w-full ${ytSoundBlocked ? "brightness-[0.96] saturate-[0.85]" : ""}`}
        >
          <div ref={mountRef} className="bedroom-yt-embed-mount" />
          {clickVeil}
        </div>
      );
    }

    if (embed.kind === "vimeo" && vimeoId) {
      return (
        <div className="bedroom-open-media-play aspect-video w-full overflow-hidden">
          <iframe
            title=""
            src={`https://player.vimeo.com/video/${vimeoId}?autoplay=1&muted=0&loop=1&controls=0&playsinline=1`}
            allow="autoplay; fullscreen; picture-in-picture"
            loading="lazy"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
          />
          {clickVeil}
        </div>
      );
    }

    return <div className="bedroom-open-media-play aspect-video w-full bg-transparent" />;
  })();

  const posterStill = (
    <div
      className="bedroom-poster-thumb-only bedroom-poster-print flex w-full flex-col overflow-hidden border-0 bg-transparent p-0 leading-none"
      style={edgeStyle}
    >
      <div className="bedroom-closed-thumb-crop">
        {/* eslint-disable-next-line @next/next/no-img-element -- native lazy load; avoid N× /_next/image optimizer calls on the wall */}
        <img
          src={stillUrl}
          alt=""
          width={480}
          height={640}
          className="bedroom-closed-thumb-crop__img absolute inset-0 h-full w-full opacity-100 saturate-[0.88] contrast-[0.94] [filter:saturate(0.88)_contrast(0.93)_brightness(1.02)]"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.14] mix-blend-multiply"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(45,48,52,0.04) 1px, rgba(45,48,52,0.04) 2px)",
          }}
          aria-hidden
        />
      </div>
    </div>
  );

  const outerTx = dragOffset.x + (open ? promote.nx : 0);
  const outerTy = dragOffset.y + (open ? promote.ny : 0);

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        top: `${wallLayout.topPct}%`,
        left: `${wallLayout.leftPct}%`,
        width: wallLayout.width,
        zIndex: isDragging ? 92 : railHoverActive ? 82 : open ? 72 : wallLayout.zIndex,
        transform: `translate(calc(-50% + ${wallLayout.offsetXPx}px), calc(-50% + ${wallLayout.offsetYPx}px)) rotate(${wallLayout.rotateDeg}deg)`,
      }}
    >
      <div
        ref={shellRef}
        className={`pointer-events-auto relative z-[1] w-full max-w-none overflow-visible bg-transparent ${isDragging ? "bedroom-poster-shell--dragging cursor-grabbing select-none" : "cursor-grab"} focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-charcoal/25`}
        data-wall-poster
        style={{
          transform: `translate(${outerTx}px, ${outerTy}px)`,
          touchAction: isDragging ? ("none" as const) : ("manipulation" as const),
        }}
        tabIndex={0}
        onPointerDownCapture={onPointerDownCapture}
        onDragStartCapture={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
        aria-label={`${project.title}. Drag to reposition. Activate to ${open ? "close" : "open"}.`}
      >
        <div
          className={`bedroom-poster-slab origin-[50%_42%] ${open ? "bedroom-poster-slab--promoted" : ""} ${railHoverActive ? "bedroom-poster-slab--rail-hover" : ""} ${isDragging ? "select-none" : ""}`}
          style={{
            transition: isDragging
              ? "none"
              : "box-shadow 440ms cubic-bezier(0.22, 1, 0.36, 1), transform 240ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          {!open ? (
            <div className="block w-full text-left focus-within:outline-none">
              {posterStill}
            </div>
          ) : (
            <div
              ref={openCardRef}
              className="bedroom-open-player-card flex flex-col overflow-hidden border-0 bg-transparent p-0 leading-none shadow-[0_6px_22px_rgba(18,20,24,0.32),0_1px_3px_rgba(0,0,0,0.35)]"
              style={edgeStyle}
            >
              {videoBlock}
              <div className="bedroom-timecode-rail" aria-label="Playback timeline">
                <span className="bedroom-timecode-rail__clock">
                  {formatClock(playbackTime)}
                </span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, playbackDuration || 0)}
                  step={0.01}
                  value={Math.min(playbackTime, Math.max(0.1, playbackDuration || 0))}
                  onPointerDown={() => setIsScrubbing(true)}
                  onPointerUp={() => setIsScrubbing(false)}
                  onBlur={() => setIsScrubbing(false)}
                  onChange={(e) => handleScrub(e.target.value)}
                  className="bedroom-timecode-rail__range"
                  aria-label="Seek timeline"
                />
                <span className="bedroom-timecode-rail__clock bedroom-timecode-rail__clock--end">
                  {formatClock(playbackDuration)}
                </span>
              </div>
              <div className="bedroom-poster-title-strip">
                <p className="bedroom-poster-title-strip__text line-clamp-2">
                  {project.title}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const BedroomPoster = memo(BedroomPosterInner);
BedroomPoster.displayName = "BedroomPoster";
