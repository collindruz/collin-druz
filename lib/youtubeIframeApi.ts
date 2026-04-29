import "@/lib/ytTypes";

let youtubeApiPromise: Promise<void> | null = null;

/**
 * Single shared load of the YouTube IFrame API (for mute / pause / viewport control).
 */
export function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();

  const w = window as Window & {
    YT?: { Player: unknown };
    onYouTubeIframeAPIReady?: () => void;
  };

  if (w.YT && typeof w.YT.Player === "function") {
    return Promise.resolve();
  }

  if (!youtubeApiPromise) {
    youtubeApiPromise = new Promise<void>((resolve) => {
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };

      if (
        !document.querySelector(
          'script[src="https://www.youtube.com/iframe_api"]',
        )
      ) {
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        tag.async = true;
        document.body.appendChild(tag);
      }
    });
  }

  return youtubeApiPromise;
}
