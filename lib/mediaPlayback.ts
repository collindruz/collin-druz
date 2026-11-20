import type Player from "@vimeo/player";
import type { YTInstance } from "@/lib/ytTypes";

export type PlaybackKind = "youtube" | "youtube-playlist" | "vimeo" | "file";

/** Shared analog-rail control surface — no provider chrome. */
export type PlaybackControls = {
  readonly kind: PlaybackKind;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(seconds: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  isMuted(): boolean;
  next?: () => void;
  previous?: () => void;
  destroy(): void;
};

const YT_PLAYING = 1;

function tryUnmutePlayYt(pl: YTInstance) {
  try {
    pl.unMute();
    pl.playVideo();
  } catch {
    /* ignore */
  }
}

export function createYouTubePlayback(
  player: YTInstance,
  kind: "youtube" | "youtube-playlist",
): PlaybackControls {
  const controls: PlaybackControls = {
    kind,
    play() {
      tryUnmutePlayYt(player);
    },
    pause() {
      try {
        player.pauseVideo();
      } catch {
        /* ignore */
      }
    },
    toggle() {
      try {
        const state = player.getPlayerState?.();
        if (state === YT_PLAYING) {
          player.pauseVideo();
          return;
        }
      } catch {
        /* ignore */
      }
      tryUnmutePlayYt(player);
    },
    seek(seconds: number) {
      try {
        player.seekTo?.(seconds, true);
      } catch {
        /* ignore */
      }
    },
    getCurrentTime() {
      try {
        return player.getCurrentTime?.() ?? 0;
      } catch {
        return 0;
      }
    },
    getDuration() {
      try {
        return player.getDuration?.() ?? 0;
      } catch {
        return 0;
      }
    },
    isMuted() {
      try {
        return typeof player.isMuted === "function" ? player.isMuted() : false;
      } catch {
        return false;
      }
    },
    destroy() {
      try {
        player.pauseVideo();
        player.mute();
        player.destroy();
      } catch {
        /* ignore */
      }
    },
  };

  if (kind === "youtube-playlist") {
    controls.next = () => {
      try {
        player.nextVideo?.();
      } catch {
        /* ignore */
      }
    };
    controls.previous = () => {
      try {
        player.previousVideo?.();
      } catch {
        /* ignore */
      }
    };
  }

  return controls;
}

export function createVimeoPlayback(player: Player): PlaybackControls {
  let time = 0;
  let duration = 0;
  let muted = false;
  let paused = true;
  let alive = true;

  const onTime = (data: { seconds: number; duration: number }) => {
    if (!alive) return;
    time = data.seconds;
    if (Number.isFinite(data.duration) && data.duration > 0) {
      duration = data.duration;
    }
  };
  const onDuration = (data: { duration: number }) => {
    if (!alive) return;
    duration = data.duration;
  };
  const onPlay = () => {
    paused = false;
  };
  const onPause = () => {
    paused = true;
  };
  const onVolume = (data: { muted: boolean }) => {
    muted = data.muted;
  };

  player.on("timeupdate", onTime);
  player.on("durationchange", onDuration);
  player.on("loadedmetadata", onDuration);
  player.on("play", onPlay);
  player.on("pause", onPause);
  player.on("volumechange", onVolume);

  void player.getDuration().then((d) => {
    if (alive && Number.isFinite(d)) duration = d;
  });
  void player.getMuted().then((m) => {
    if (alive) muted = m;
  });
  void player.getPaused().then((p) => {
    if (alive) paused = p;
  });

  const unmutePlay = () => {
    void (async () => {
      try {
        await player.setMuted(false);
        await player.setVolume(1);
        await player.play();
      } catch {
        try {
          await player.play();
        } catch {
          /* autoplay / privacy */
        }
      }
    })();
  };

  return {
    kind: "vimeo",
    play() {
      unmutePlay();
    },
    pause() {
      void player.pause().catch(() => {});
    },
    toggle() {
      if (paused) unmutePlay();
      else void player.pause().catch(() => {});
    },
    seek(seconds: number) {
      void player.setCurrentTime(seconds).catch(() => {});
      time = seconds;
    },
    getCurrentTime() {
      return time;
    },
    getDuration() {
      return duration;
    },
    isMuted() {
      return muted;
    },
    destroy() {
      alive = false;
      try {
        player.off("timeupdate", onTime);
        player.off("durationchange", onDuration);
        player.off("loadedmetadata", onDuration);
        player.off("play", onPlay);
        player.off("pause", onPause);
        player.off("volumechange", onVolume);
      } catch {
        /* ignore */
      }
      void (async () => {
        try {
          await player.pause();
          await player.setMuted(true);
        } catch {
          /* ignore */
        }
        try {
          await player.destroy();
        } catch {
          /* ignore */
        }
      })();
    },
  };
}

export function createFilePlayback(video: HTMLVideoElement): PlaybackControls {
  return {
    kind: "file",
    play() {
      video.muted = false;
      void video.play().catch(() => {});
    },
    pause() {
      video.pause();
      video.muted = true;
    },
    toggle() {
      if (video.paused) {
        video.muted = false;
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    },
    seek(seconds: number) {
      video.currentTime = seconds;
    },
    getCurrentTime() {
      return video.currentTime || 0;
    },
    getDuration() {
      return video.duration || 0;
    },
    isMuted() {
      return video.muted;
    },
    destroy() {
      video.pause();
      video.muted = true;
    },
  };
}

export function watchOriginalHref(input: {
  videoUrl?: string;
  projectUrl?: string;
}): string | null {
  const video = input.videoUrl?.trim() ?? "";
  const project = input.projectUrl?.trim() ?? "";
  if (/^https?:\/\//i.test(video)) return video;
  if (/^https?:\/\//i.test(project)) return project;
  return null;
}
