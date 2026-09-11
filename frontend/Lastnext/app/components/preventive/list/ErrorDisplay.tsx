"use client";

import { X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";
import { useT } from "@/app/lib/i18n/LocaleProvider";

interface ErrorDisplayProps {
  error: string;
  onClear: () => void;
}

export default function ErrorDisplay({ error, onClear }: ErrorDisplayProps) {
  const t = useT();
  return (
    <FeedbackState
      variant="error"
      title={t("pm.loadError")}
      description={error}
      className="min-h-48"
      action={
        <Button type="button" variant="outline" onClick={onClear}>
          <X className="h-4 w-4" aria-hidden="true" />
          {t("pm.dismiss")}
        </Button>
      }
    />
  );
}
