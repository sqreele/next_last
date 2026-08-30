"use client";

import React from "react";
import {
  Package,
  AlertTriangle,
  CheckCircle2,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import { cn } from "@/app/lib/utils/cn";

interface InventoryItemLike {
  status?: string;
  quantity?: number;
  min_quantity?: number;
  unit_price?: number;
}

interface InventoryMobileStatsProps {
  items: InventoryItemLike[];
  total: number;
  /** When `true`, the low-stock toggle is active and chip renders pressed. */
  lowStockOnly: boolean;
  onToggleLowStock: () => void;
  className?: string;
}

export function InventoryMobileStats({
  items,
  total,
  lowStockOnly,
  onToggleLowStock,
  className,
}: InventoryMobileStatsProps) {
  const inStock = items.filter(
    (i) => i.status === "available" || i.status === "in_stock",
  ).length;
  const lowStock = items.filter((i) => i.status === "low_stock").length;
  const outOfStock = items.filter((i) => i.status === "out_of_stock").length;
  const orderedCount = items.filter(
    (i) => i.status === "ordered" || i.status === "reserved",
  ).length;

  const inventoryValue = items.reduce((sum, i) => {
    if (typeof i.unit_price === "number" && typeof i.quantity === "number") {
      return sum + i.unit_price * i.quantity;
    }
    return sum;
  }, 0);

  const tiles: Array<{
    label: string;
    value: number | string;
    icon: React.ComponentType<{ className?: string }>;
    tone: "primary" | "success" | "warning" | "danger" | "info";
    onClick?: () => void;
    active?: boolean;
  }> = [
    {
      label: "Total",
      value: total,
      icon: Package,
      tone: "primary",
    },
    {
      label: "In stock",
      value: inStock,
      icon: CheckCircle2,
      tone: "success",
    },
    {
      label: "Low stock",
      value: lowStock,
      icon: AlertTriangle,
      tone: "warning",
      onClick: onToggleLowStock,
      active: lowStockOnly,
    },
    {
      label: "Out of stock",
      value: outOfStock,
      icon: XCircle,
      tone: "danger",
    },
    {
      label: "Ordered",
      value: orderedCount,
      icon: ShoppingCart,
      tone: "info",
    },
  ];

  const tones = {
    primary: {
      card: "border-primary/25 bg-primary/[0.04]",
      icon: "bg-primary/10 text-primary",
      value: "text-primary",
    },
    success: {
      card: "border-success/25 bg-success/[0.04]",
      icon: "bg-success/10 text-success",
      value: "text-success",
    },
    warning: {
      card: "border-warning/30 bg-warning/[0.06]",
      icon: "bg-warning/10 text-warning-emphasis",
      value: "text-warning-emphasis",
    },
    danger: {
      card: "border-destructive/25 bg-destructive/[0.04]",
      icon: "bg-destructive/10 text-destructive",
      value: "text-destructive",
    },
    info: {
      card: "border-info/25 bg-info/[0.04]",
      icon: "bg-info/10 text-info",
      value: "text-info",
    },
  } as const;

  return (
    <section
      aria-label="Inventory summary"
      className={cn("space-y-2", className)}
    >
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {tiles.map((tile) => {
          const tone = tones[tile.tone];
          const Icon = tile.icon;
          const interactive = !!tile.onClick;
          const className = cn(
            "flex min-w-[124px] flex-none snap-start flex-col items-start gap-2 rounded-xl border p-3 shadow-soft transition-colors sm:min-w-0",
            tone.card,
            tile.active && "ring-2 ring-warning ring-offset-2",
            interactive &&
              "touch-manipulation hover:border-warning/60 hover:bg-warning/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          );
          const content = (
            <>
              <div className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    "grid h-9 w-9 place-items-center rounded-lg",
                    tone.icon,
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {tile.active && (
                  <span className="rounded-full bg-warning px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
                    ON
                  </span>
                )}
              </div>
              <p className={cn("text-2xl font-bold leading-none tabular-nums", tone.value)}>
                {tile.value}
              </p>
              <p className="text-xs font-semibold text-muted-foreground">
                {tile.label}
              </p>
            </>
          );
          return interactive ? (
            <button
              key={tile.label}
              type="button"
              onClick={tile.onClick}
              aria-pressed={tile.active}
              className={className}
            >
              {content}
            </button>
          ) : (
            <div key={tile.label} className={className}>
              {content}
            </div>
          );
        })}
      </div>
      {inventoryValue > 0 && (
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Approx. on-hand value:{" "}
          <span className="text-foreground">
            {inventoryValue.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
            })}
          </span>
        </p>
      )}
    </section>
  );
}
