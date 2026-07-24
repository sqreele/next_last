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
  const inStock = items.filter((i) => i.status === "in_stock").length;
  const lowStock = items.filter((i) => i.status === "low_stock").length;
  const outOfStock = items.filter((i) => i.status === "out_of_stock").length;
  const orderedCount = items.filter((i) => i.status === "ordered").length;

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
      card: "border-blue-200 bg-blue-50/60",
      icon: "bg-blue-600 text-white",
      value: "text-blue-900",
    },
    success: {
      card: "border-emerald-200 bg-emerald-50/60",
      icon: "bg-emerald-600 text-white",
      value: "text-emerald-900",
    },
    warning: {
      card: "border-amber-200 bg-amber-50/60",
      icon: "bg-amber-500 text-white",
      value: "text-amber-900",
    },
    danger: {
      card: "border-rose-200 bg-rose-50/60",
      icon: "bg-rose-600 text-white",
      value: "text-rose-900",
    },
    info: {
      card: "border-indigo-200 bg-indigo-50/60",
      icon: "bg-indigo-600 text-white",
      value: "text-indigo-900",
    },
  } as const;

  return (
    <section
      aria-label="Inventory summary"
      className={cn("space-y-2", className)}
    >
      <div className="-mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        {tiles.map((tile) => {
          const tone = tones[tile.tone];
          const Icon = tile.icon;
          const interactive = !!tile.onClick;
          const className = cn(
            "flex min-w-[120px] flex-none snap-start flex-col items-start gap-1 rounded-xl border p-3 shadow-[var(--pcms-shadow-soft)] transition-all",
            tone.card,
            tile.active && "ring-2 ring-blue-500 ring-offset-1",
            interactive &&
              "hover:shadow-soft active:scale-[0.98] touch-manipulation",
          );
          const content = (
            <>
              <div className="flex w-full items-center justify-between">
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-xl",
                    tone.icon,
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                {tile.active && (
                  <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    ON
                  </span>
                )}
              </div>
              <p className={cn("text-2xl font-bold leading-none", tone.value)}>
                {tile.value}
              </p>
              <p className="text-[10px] font-bold text-muted-foreground">
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
        <p className="px-1 text-xs font-semibold text-muted-foreground">
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
