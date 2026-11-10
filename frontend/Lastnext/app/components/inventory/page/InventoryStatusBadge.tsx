"use client";

import { Badge } from "@/app/components/ui/badge";
import { AlertTriangle, CheckCircle2, XCircle, Clock } from "lucide-react";
import type { DictKey } from "@/app/lib/i18n/dictionary";
import type { useT } from "@/app/lib/i18n/LocaleProvider";
import { STATUS_COLORS } from "./inventory-page-config";

export function InventoryStatusBadge({ status, t }: { status: string; t: ReturnType<typeof useT> }) {
    const colorClass =
      STATUS_COLORS[status] || "bg-muted text-foreground border-border";
    const statusKeys: Record<string, DictKey> = {
      available: "inventory.status.available",
      low_stock: "inventory.status.lowStock",
      out_of_stock: "inventory.status.outOfStock",
      reserved: "inventory.status.reserved",
      maintenance: "inventory.status.maintenance",
    };
    const statusText = statusKeys[status]
      ? t(statusKeys[status])
      : status.replaceAll("_", " ");

    return (
      <Badge className={`${colorClass} gap-1 whitespace-nowrap`}>
        {status === "available" && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
        {status === "low_stock" && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
        {status === "out_of_stock" && <XCircle className="h-3 w-3" aria-hidden="true" />}
        {status === "reserved" && <Clock className="h-3 w-3" aria-hidden="true" />}
        {statusText}
      </Badge>
    );
  }
