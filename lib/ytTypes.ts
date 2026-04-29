/** Minimal typing for YT.Player instances (iframe API). */
export type YTInstance = {
  playVideo(): void;
  pauseVideo(): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
  seekTo?(seconds: number, allowSeekAhead?: boolean): void;
  getCurrentTime?(): number;
  getDuration?(): number;
  isMuted?: () => boolean;
  getPlayerState?: () => number;
  /** Match IFrame API — keeps embed at shell pixels (avoids “100%” resolving wrong / zoomed pre-play UI). */
  setSize?(width: number, height: number): void;
};

declare global {
  interface Window {
    YT: {
      Player: new (
        el: HTMLElement | string,
        opts: {
          videoId: string;
          width?: string | number;
          height?: string | number;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (event: { target: YTInstance }) => void;
            onStateChange?: (event: {
              data: number;
              target: YTInstance;
            }) => void;
          };
        },
      ) => YTInstance;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export {};
