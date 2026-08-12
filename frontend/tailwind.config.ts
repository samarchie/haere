import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Hanken Grotesk", "ui-sans-serif", "system-ui"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        "kotare-navy": "#214d65",
        "kotare-blue": "#287DAB",
        "kotare-teal": "#2F6B52",
        "kotare-brown": "#624B27",
        "kotare-grey": "#CACFD0",
        "surface-ground": "#f2f2f5",
        "surface-card": "#ffffff",
        ink: "#18181b",
        "ink-soft": "#71717a",
        "ink-faint": "#a1a1aa",
      },
    },
  },
} satisfies Config;
