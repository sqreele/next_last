export const designTokens = {
  typography: {
    display: "text-4xl leading-10 font-bold tracking-tight",
    pageTitle: "text-3xl leading-9 font-bold tracking-tight",
    sectionTitle: "text-xl leading-7 font-semibold",
    cardTitle: "text-base leading-6 font-semibold",
    body: "text-base leading-6",
    bodySmall: "text-sm leading-5",
    label: "text-sm leading-5 font-medium",
    caption: "text-xs leading-4",
  },
  layout: {
    pagePadding: "px-4 py-5 md:px-6 md:py-6 xl:px-8 xl:py-8",
    pageGap: "space-y-6",
    contentWidth: "max-w-[94rem]",
  },
  radius: {
    small: "rounded-md",
    control: "rounded-lg",
    card: "rounded-xl",
    dialog: "rounded-2xl",
    badge: "rounded-full",
  },
  shadow: {
    surface: "shadow-soft",
    elevated: "shadow-card",
  },
} as const;

