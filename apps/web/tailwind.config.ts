import type { Config } from "tailwindcss";

/**
 * Design system tokens.
 * ONE accent color (indigo). Neutrals are Tailwind's gray.
 * Accent pairings chosen for WCAG AA contrast:
 *  - white on accent-600 -> primary buttons
 *  - accent-700 on white -> accent text/links
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
      },
      maxWidth: {
        content: "72rem",
      },
    },
  },
  plugins: [],
};

export default config;