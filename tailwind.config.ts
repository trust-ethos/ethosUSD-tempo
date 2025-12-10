import { type Config } from "tailwindcss";

export default {
  content: [
    "{routes,islands,components}/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ethos: {
          primary: "#6366f1",
          secondary: "#8b5cf6",
          accent: "#22d3ee",
          dark: "#0f172a",
          darker: "#020617",
          card: "#1e293b",
          border: "#334155",
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
} satisfies Config;

