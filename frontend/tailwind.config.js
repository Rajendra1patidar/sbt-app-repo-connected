/** @type {import('tailwindcss').Config} */
function themeColor(varName) {
  return ({ opacityValue }) =>
    opacityValue === undefined ? `rgb(var(${varName}))` : `rgb(var(${varName}) / ${opacityValue})`;
}

// Every colour family is backed by CSS variables (see index.css) so the same
// class — bg-good-50, text-brand-600 — resolves to a pastel tint in light mode
// and a deep tint in dark mode, with no per-component dark: variants.
function scale(name, shades) {
  return Object.fromEntries(shades.map((s) => [s, themeColor(`--c-${name}-${s}`)]));
}
const S9 = [50, 100, 200, 300, 400, 500, 600, 700, 800];

const PLEX = ['"IBM Plex Sans"', '"IBM Plex Sans Devanagari"', "-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", "sans-serif"];

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        // One family for the whole app. "display" and "mono" stay as aliases so older
        // screens keep compiling; numbers stay aligned through tabular figures (index.css).
        sans: PLEX,
        display: PLEX,
        mono: PLEX,
        // Mono is only for document numbers such as EST-2041.
        doc: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      fontSize: {
        // Type scale from the design language board.
        hero: ["56px", { lineHeight: "60px", letterSpacing: "-0.03em", fontWeight: "300" }],
        "hero-md": ["44px", { lineHeight: "50px", letterSpacing: "-0.03em", fontWeight: "300" }],
        "hero-sm": ["28px", { lineHeight: "32px", letterSpacing: "-0.02em", fontWeight: "300" }],
        large: ["34px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "600" }],
        section: ["22px", { lineHeight: "28px", letterSpacing: "-0.01em", fontWeight: "600" }],
        lead: ["17px", { lineHeight: "22px" }],
        body: ["16px", { lineHeight: "22px" }],
        caption: ["13px", { lineHeight: "18px" }],
        micro: ["12px", { lineHeight: "16px" }],
      },
      colors: {
        paper: themeColor("--color-paper"),   // Canvas
        ink: themeColor("--color-ink"),       // Ink
        line: themeColor("--color-line"),     // 1 px hairline
        card: themeColor("--color-card"),     // surface
        fill: themeColor("--color-fill"),     // segmented / search fill
        rule: themeColor("--color-rule"),     // stronger border (inputs, outline buttons)
        edge: themeColor("--color-edge"),     // input + capture bar border
        mute: themeColor("--color-mute"),     // secondary text
        faint: themeColor("--color-faint"),   // tertiary text
        chip: themeColor("--color-chip"),     // neutral chip (Draft)
        chipText: themeColor("--color-chip-text"),
        sidebar: themeColor("--color-sidebar"),
        sidebarText: themeColor("--color-sidebar-text"),
        sidebarLine: themeColor("--color-sidebar-line"),
        sidebarHeading: themeColor("--color-sidebar-heading"),
        brand: { ...scale("brand", [...S9, 900]) },   // Action
        insight: scale("insight", S9),                // Insight (violet)
        good: scale("good", S9),                      // Gain
        bad: scale("bad", S9),                        // Risk
        warn: scale("warn", S9),                      // Caution
        advance: scale("advance", S9),
      },
      borderRadius: {
        // Concentric corners: sheet 28 → group 16 → control 12.
        sheet: "28px",
        card: "16px",
        group: "16px",
        control: "12px",
        pill: "999px",
      },
      boxShadow: {
        // Shadows only on sheets and the capture bar. Everything else is a hairline.
        card: "none",
        sheet: "0 -10px 40px -14px rgba(22,22,22,.28)",
        capture: "0 10px 28px -14px rgba(22,22,22,.28)",
      },
    },
  },
  plugins: [],
};
