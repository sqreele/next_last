import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, Circle, Siren } from "lucide-react";

export type PriorityConfig = {
  label: string;
  description: string;
  icon: LucideIcon;
  className: string;
};

export const priorityConfig = {
  low: {
    label: "Low",
    description: "Can be handled in the normal queue",
    icon: ArrowDown,
    className: "border-border bg-muted text-muted-foreground",
  },
  medium: {
    label: "Normal",
    description: "Standard operational priority",
    icon: Circle,
    className: "border-info/30 bg-info/10 text-info",
  },
  high: {
    label: "High",
    description: "Needs prompt attention",
    icon: ArrowUp,
    className: "border-warning/35 bg-warning/10 text-warning-foreground",
  },
  critical: {
    label: "Urgent",
    description: "Immediate attention is required",
    icon: Siren,
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
} as const satisfies Record<string, PriorityConfig>;

export type ConfiguredPriority = keyof typeof priorityConfig;

export function normalizePriorityValue(priority?: string): ConfiguredPriority {
  const key = (priority || "medium").trim().toLowerCase().replace(/[-\s]+/g, "_");
  if (key === "urgent") return "critical";
  return key in priorityConfig ? (key as ConfiguredPriority) : "medium";
}

export function getPriorityConfig(priority?: string): PriorityConfig {
  return priorityConfig[normalizePriorityValue(priority)];
}

