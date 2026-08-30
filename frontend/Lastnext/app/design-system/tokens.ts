export const designTokens = {
  typography: {
    display: "text-2xl leading-8 font-semibold tracking-tight",
    pageTitle: "text-xl leading-7 font-semibold tracking-tight",
    sectionTitle: "text-base leading-6 font-semibold",
    cardTitle: "text-[15px] leading-6 font-semibold",
    body: "text-sm leading-6",
    bodySmall: "text-sm leading-5",
    label: "text-sm leading-5 font-medium",
    caption: "text-xs leading-4",
  },
  layout: {
    pagePadding: "px-4 py-5 md:px-5 md:py-6 xl:px-6",
    pageGap: "space-y-5",
    contentWidth: "max-w-[94rem]",
  },
  radius: {
    small: "rounded-sm",
    control: "rounded-md",
    card: "rounded-lg",
    dialog: "rounded-xl",
    badge: "rounded-full",
  },
  shadow: {
    surface: "shadow-soft",
    elevated: "shadow-card",
  },
} as const;
