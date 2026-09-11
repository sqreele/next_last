"use client";

import { SkeletonList } from "@/app/components/ui/loading";
import { useT } from "@/app/lib/i18n/LocaleProvider";

export default function LoadingState() {
  const t = useT();
  return (
    <div aria-busy="true" aria-label={t("pm.loading")}>
      <SkeletonList rows={6} />
    </div>
  );
}
