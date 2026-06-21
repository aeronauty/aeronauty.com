import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // "The Standard Model" — the accent is editor's-correction red.
        // The old code used `teal-*` utilities for the accent, so teal is
        // remapped to the red ramp: every existing teal-* utility now reads red.
        teal: {
          50: "#FCEBEB",
          100: "#F7C1C1",
          200: "#F09595",
          300: "#EC6E6E",
          400: "#E24B4A",
          500: "#D7263D",
          600: "#D7263D",
          700: "#C01F33",
          800: "#A81C2E",
          900: "#791F1F",
        },
        accent: {
          DEFAULT: "#D7263D",
          deep: "#A81C2E",
        },
      },
      borderRadius: {
        DEFAULT: "2px",
      },
      maxWidth: {
        container: "78rem",
      },
      keyframes: {
        blink: { "50%": { opacity: "0" } },
      },
      animation: {
        blink: "blink 1s step-end infinite",
      },
    },
  },
  plugins: [],
};
export default config;


