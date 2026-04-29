import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        wall: {
          DEFAULT: "#ecece8",
          wash: "#e5e6e2",
        },
        /** Cool gallery wall — off-white, no warmth */
        room: {
          DEFAULT: "#F2F2F0",
          mute: "#EBEBEA",
          veil: "#E6E6E8",
        },
        /** Cool grey text — not pure black */
        charcoal: {
          DEFAULT: "#3A3C40",
          soft: "#4B4D52",
        },
        bone: {
          DEFAULT: "#3A3C40",
          deep: "#4B4D52",
        },
        ink: {
          DEFAULT: "#3A3C40",
        },
        gray: {
          faded: "#8B8E94",
          mist: "#73767C",
        },
        taupe: {
          DEFAULT: "#88888E",
          warm: "#8E8E93",
        },
        dust: {
          DEFAULT: "#6B6E74",
          deep: "#585B60",
        },
        cement: {
          DEFAULT: "#9A9CA2",
          mute: "#909298",
        },
        field: {
          DEFAULT: "#F2F2F0",
          deep: "#E8E8EA",
          dim: "#E0E0E2",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        display: [
          "var(--font-sans)",
          "Helvetica Neue",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      letterSpacing: {
        tape: "0.12em",
        nav: "0.18em",
        hero: "-0.038em",
      },
      transitionDuration: {
        weighted: "1100ms",
        slow: "900ms",
        reveal: "1250ms",
        veil: "850ms",
      },
      transitionTimingFunction: {
        weighted: "cubic-bezier(0.22, 0.06, 0.12, 1)",
        drift: "cubic-bezier(0.16, 0.08, 0.2, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
