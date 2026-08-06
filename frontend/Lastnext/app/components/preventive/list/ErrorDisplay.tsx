"use client";

import { X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { FeedbackState } from "@/app/components/feedback/FeedbackState";

interface ErrorDisplayProps {
  error: string;
  onClear: () => void;
}

export default function ErrorDisplay({ error, onClear }: ErrorDisplayProps) {
  return (
    <FeedbackState
      variant="error"
      title="Unable to load preventive maintenance"
      description={error}
      className="mb-5 min-h-48"
      action={
        <Button type="button" variant="outline" onClick={onClear}>
          <X className="h-4 w-4" aria-hidden="true" />
          Dismiss
        </Button>
      }
    />
  );
}
