"use client";

import React, { useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { useT } from "@/app/lib/i18n/LocaleProvider";

interface DeleteModalProps {
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
  selectedCount?: number;
}

const DeleteModal: React.FC<DeleteModalProps> = ({ onConfirm, onCancel, isPending = false, selectedCount = 1 }) => {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [isPending, onCancel]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
      <div
        ref={dialogRef}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-card p-4 shadow-xl sm:p-6"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-pm-title"
        aria-describedby="delete-pm-description"
      >
        <div className="flex items-center mb-4">
          <div className="shrink-0">
            <div className="bg-red-100 rounded-full p-2">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
          </div>
          <div className="ml-4">
            <h3 id="delete-pm-title" className="text-lg font-medium text-foreground">
              {selectedCount > 1 ? t("pm.confirmBulkDelete", { count: selectedCount }) : t("pm.confirmDelete")}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t("pm.cannotUndo")}
            </p>
          </div>
        </div>
        <p id="delete-pm-description" className="mb-6 text-sm text-muted-foreground md:text-base">
          {selectedCount > 1 ? t("pm.bulkDeleteWarning", { count: selectedCount }) : t("pm.deleteWarning")}
        </p>
        <div className="flex flex-col sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3">
          <button
            ref={cancelRef}
            onClick={onCancel}
            disabled={isPending}
            className="min-h-11 w-full rounded-lg border border-border px-4 py-2 text-muted-foreground transition-colors hover:bg-muted sm:w-auto"
          >
            {t("action.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="min-h-11 w-full rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 sm:w-auto"
          >
            {isPending ? t("pm.deleting") : selectedCount > 1 ? t("pm.deleteSelected") : t("pm.deleteTask")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteModal;
