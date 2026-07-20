/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      colors: {
        paper: "#F5F3EE",
        ink: "#171A21",
        line: "#E6E2D8",
        brand: {
          50: "#EAF1FB", 100: "#D3E3F7", 200: "#A8C7EF", 300: "#78A6E3",
          400: "#4C86D6", 500: "#2F5AA8", 600: "#22437F", 700: "#1B3563",
          800: "#152848", 900: "#0F1C33",
        },
        good: { 50: "#E9F6EE", 100: "#CFEBDA", 200: "#A3D9BB", 300: "#72C299", 400: "#49AC7E", 500: "#2E7D5B", 600: "#256B4C", 700: "#1F5A40", 800: "#194935" },
        bad: { 50: "#FCEAE7", 100: "#F8D2CC", 200: "#F0AA9E", 300: "#E37E6C", 400: "#C95745", 500: "#B23A2E", 600: "#9C3026", 700: "#8A2C22", 800: "#6E231B" },
        warn: { 50: "#FBF0DC", 100: "#F5DFB2", 200: "#EDC77E", 300: "#E0AC4F", 400: "#CB932E", 500: "#B27B1E", 600: "#9C6A18", 700: "#8A5F16", 800: "#6E4A11" },
        advance: { 50: "#EAF1FB", 100: "#D3E3F7", 200: "#A8C7EF", 300: "#78A6E3", 400: "#4C86D6", 500: "#2F5AA8", 600: "#26497F", 700: "#1F3F78", 800: "#152848" },
      },
      borderRadius: {
        card: "16px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(23,26,33,0.04), 0 8px 24px -12px rgba(23,26,33,0.10)",
      },
    },
  },
  plugins: [],
};
