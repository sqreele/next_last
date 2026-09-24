"use client";

import { useState } from "react";
import { RefreshCcw } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { useT } from "@/app/lib/i18n/LocaleProvider";
import { cn } from "@/app/lib/utils/cn";

type RefreshPageButtonProps = {
  className?: string;
};

export function RefreshPageButton({ className }: RefreshPageButtonProps) {
  const t = useT();
  const [refreshing, setRefreshing] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      className={cn("min-h-11", className)}
      disabled={refreshing}
      onClick={() => {
        setRefreshing(true);
        window.location.reload();
      }}
    >
      <RefreshCcw
        className={cn("h-4 w-4", refreshing && "animate-spin")}
        aria-hidden="true"
      />
      {refreshing ? t("common.loading") : t("action.refresh")}
    </Button>
  );
}
