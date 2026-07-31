/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#f3f7f5",
      "foreground": "#0c1713",
      "border": "#d4e0da",
      "card": "#ffffff",
      "cardForeground": "#0c1713",
      "popover": "#ffffff",
      "popoverForeground": "#0c1713",
      "primary": "#049756",
      "primaryForeground": "#ffffff",
      "secondary": "#e5eeea",
      "secondaryForeground": "#123126",
      "muted": "#e9f0ed",
      "mutedForeground": "#50645a",
      "accent": "#dce9e3",
      "accentForeground": "#123126",
      "destructive": "#b42318",
      "destructiveForeground": "#ffffff",
      "input": "#d4e0da",
      "ring": "#049756",
      "chart1": "#049756",
      "chart2": "#0f9fa5",
      "chart3": "#1879b8",
      "chart4": "#2f61c9",
      "chart5": "#6845c7",
      "sidebar": "#eaf2ee",
      "sidebarForeground": "#18352a",
      "sidebarBorder": "#d4e0da",
      "sidebarPrimary": "#049756",
      "sidebarPrimaryForeground": "#ffffff",
      "sidebarAccent": "#dce9e3",
      "sidebarAccentForeground": "#123126",
      "sidebarRing": "#049756"
    },
    "dark": {
      "background": "#0c0f12",
      "foreground": "#f5f7fa",
      "border": "#222831",
      "card": "#11161d",
      "cardForeground": "#f5f7fa",
      "popover": "#11161d",
      "popoverForeground": "#f5f7fa",
      "primary": "#10b981",
      "primaryForeground": "#07110d",
      "secondary": "#222831",
      "secondaryForeground": "#f5f7fa",
      "muted": "#222831",
      "mutedForeground": "#9aa7b7",
      "accent": "#1b232d",
      "accentForeground": "#f5f7fa",
      "destructive": "#801d1d",
      "destructiveForeground": "#fff7f7",
      "input": "#222831",
      "ring": "#10b981",
      "chart1": "#10b981",
      "chart2": "#17d4d4",
      "chart3": "#1999e6",
      "chart4": "#3678f0",
      "chart5": "#6633f3",
      "sidebar": "#0e1318",
      "sidebarForeground": "#f5f7fa",
      "sidebarBorder": "#222831",
      "sidebarPrimary": "#10b981",
      "sidebarPrimaryForeground": "#07110d",
      "sidebarAccent": "#18212b",
      "sidebarAccentForeground": "#f5f7fa",
      "sidebarRing": "#10b981"
    }
  },
  "fontFamily": {
    "sans": [
      "Inter",
      "sans-serif"
    ],
    "serif": [
      "Georgia",
      "serif"
    ],
    "mono": [
      "JetBrains Mono",
      "Fira Code",
      "monospace"
    ]
  },
  "radius": "0.3rem",
  "spacing": "0.25rem"
} as const;

export type Tokens = typeof tokens;
export default tokens;
