import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f1f5fb",
          100: "#dde7f5",
          200: "#bccfeb",
          500: "#2b5aa8",
          600: "#1f4687",
          700: "#173768",
          800: "#112a50",
          900: "#0b1d38",
          950: "#071326",
        },
        border: "hsl(214 20% 90%)",
        background: "hsl(210 30% 98%)",
        foreground: "hsl(222 40% 12%)",
        muted: { DEFAULT: "hsl(214 25% 95%)", foreground: "hsl(215 16% 42%)" },
        accent: { DEFAULT: "#2563eb", foreground: "#ffffff" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.06)",
      },
    },
  },
  plugins: [],
} satisfies Config;
