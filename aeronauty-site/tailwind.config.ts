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
        // "The Standard Model" — the accent is editor's-correction red. Used via
        // `var(--accent)` / the `accent-*` utilities below. NOTE: `teal` is left
        // as Tailwind's default (green) on purpose — downstream features use
        // teal-* as their success/positive color, so it must NOT be hijacked.
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


