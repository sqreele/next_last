import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    screens: {
      xs: "475px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
      // Device-specific breakpoints
      mobile: { max: "767px" },
      tablet: { min: "768px", max: "1023px" },
      desktop: { min: "1024px" },
      // Orientation-specific breakpoints
      portrait: { raw: "(orientation: portrait)" },
      landscape: { raw: "(orientation: landscape)" },
      // High-density screens
      retina: { raw: "(-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi)" },
    },
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
        "safe-left": "env(safe-area-inset-left)",
        "safe-right": "env(safe-area-inset-right)",
        18: "4.5rem",
        22: "5.5rem",
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.75rem" }],
        "3xl": ["1.875rem", { lineHeight: "2.25rem" }],
        "4xl": ["2.25rem", { lineHeight: "2.5rem" }],
        "5xl": ["3rem", { lineHeight: "3.5rem" }],
        "6xl": ["3.75rem", { lineHeight: "4rem" }],
      },
      minHeight: {
        "touch-target": "44px",
        "screen-mobile": "100vh",
        "screen-safe": "calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))",
      },
      minWidth: {
        "touch-target": "44px",
      },
      maxWidth: {
        "8xl": "88rem",
        "9xl": "96rem",
      },
      zIndex: {
        60: "60",
        70: "70",
        80: "80",
        90: "90",
        100: "100",
      },
      animation: {
        "slide-up": "slideUp 0.3s ease-out",
        "slide-down": "slideDown 0.3s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "slide-in-left": "slideInLeft 0.3s ease-out",
        "fade-in": "fadeIn 0.2s ease-out",
        "bounce-subtle": "bounceSubtle 2s infinite",
      },
      keyframes: {
        slideUp: {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideInRight: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        slideInLeft: {
          "0%": { transform: "translateX(-100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        bounceSubtle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
    },
  },
  plugins: [
    // Custom plugin for mobile-first utilities
    function({ addUtilities, theme }: { addUtilities: any; theme: any }) {
      const newUtilities = {
        ".touch-manipulation": {
          "touch-action": "manipulation",
        },
        ".touch-pan-x": {
          "touch-action": "pan-x",
        },
        ".touch-pan-y": {
          "touch-action": "pan-y",
        },
        ".touch-pinch-zoom": {
          "touch-action": "pinch-zoom",
        },
        ".overscroll-none": {
          "overscroll-behavior": "none",
        },
        ".overscroll-contain": {
          "overscroll-behavior": "contain",
        },
        ".scroll-smooth": {
          "scroll-behavior": "smooth",
        },
        ".scrollbar-hide": {
          "-ms-overflow-style": "none",
          "scrollbar-width": "none",
          "&::-webkit-scrollbar": {
            display: "none",
          },
        },
        ".text-balance": {
          "text-wrap": "balance",
        },
        ".safe-area-inset": {
          "padding-top": "env(safe-area-inset-top)",
          "padding-right": "env(safe-area-inset-right)",
          "padding-bottom": "env(safe-area-inset-bottom)",
          "padding-left": "env(safe-area-inset-left)",
        },
      };
      addUtilities(newUtilities);
    },
  ],
} satisfies Config;
