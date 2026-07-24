"use client";

import React, { useRef, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { useSession } from "@/app/lib/session.client";
import { cn } from "@/app/lib/utils/cn";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://hotelcarepro.com");

export interface CsvImportResult {
  created_count: number;
  attached_count?: number;
  error_count: number;
  created?: Array<{
    row: number;
    name: string;
    item_id?: string;
    room_id?: number;
  }>;
  attached?: Array<{ row: number; name: string; room_id?: number }>;
  errors: Array<{ row: number; error: string }>;
}

interface CsvImportDialogProps {
  /** Visible name of the resource being imported (e.g. "inventory items", "rooms"). */
  label: string;
  /** Helper text shown under the dialog title. */
  description: string;
  /** Path to the bulk-import endpoint, relative to API_BASE_URL. */
  importPath: string;
  /** Path to the template download endpoint. */
  templatePath: string;
  /** Default filename when the user downloads the template. */
  templateFilename: string;
  /** Active property to pass via ?property_id=. */
  currentPropertyId?: string | null;
  /** Optional callback fired when at least one row imports successfully. */
  onImported?: (result: CsvImportResult) => void;
  triggerLabel?: string;
  className?: string;
}

export function CsvImportDialog({
  label,
  description,
  importPath,
  templatePath,
  templateFilename,
  currentPropertyId,
  onImported,
  triggerLabel,
  className,
}: CsvImportDialogProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setError(null);
    setResult(null);
    setSubmitting(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const downloadTemplate = async () => {
    const token = session?.user?.accessToken;
    if (!token) {
      setError("Sign in again to download the template.");
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}${templatePath}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Template fetch failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = templateFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Could not download the template.");
    }
  };

  const handleUpload = async () => {
    setError(null);
    setResult(null);
    if (!file) {
      setError("Pick a CSV file first.");
      return;
    }
    const token = session?.user?.accessToken;
    if (!token) {
      setError("Sign in again to import.");
      return;
    }
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (currentPropertyId) formData.append("property_id", currentPropertyId);

      const res = await fetch(
        `${API_BASE_URL}${importPath}${
          currentPropertyId
            ? `?property_id=${encodeURIComponent(currentPropertyId)}`
            : ""
        }`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      );
      const data = (await res.json().catch(() => null)) as
        CsvImportResult | { error?: string } | null;
      if (res.status >= 500) throw new Error("Server error — try again.");
      if (!data) throw new Error("Empty response from server.");
      if ("error" in data && !("created_count" in data) && data.error) {
        throw new Error(data.error);
      }
      setResult(data as CsvImportResult);
      const r = data as CsvImportResult;
      if ((r.created_count || 0) + (r.attached_count || 0) > 0) {
        onImported?.(r);
      }
    } catch (err: any) {
      setError(err?.message || "Could not import the file.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalCreated =
    (result?.created_count || 0) + (result?.attached_count || 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className={cn("h-10 gap-2", className)}>
          <Upload className="h-4 w-4" />
          {triggerLabel || "Import CSV"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-xl bg-card p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <DialogTitle className="text-lg font-bold text-foreground">
            Bulk-import {label}
          </DialogTitle>
          <p className="text-xs font-medium text-muted-foreground">
            {description}
          </p>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              Need a starting point?
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={downloadTemplate}
              className="h-9 border-blue-300 text-blue-700"
            >
              <Download className="mr-1 h-4 w-4" /> Template
            </Button>
          </div>

          <label
            htmlFor="csv-import-file"
            className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted px-4 py-8 text-center transition-colors hover:border-blue-400 hover:bg-blue-50"
          >
            <Upload className="h-7 w-7 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground">
              {file ? file.name : "Choose a CSV file"}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {file
                ? `${(file.size / 1024).toFixed(1)} KB`
                : "Tap to browse or drag-and-drop"}
            </span>
            <input
              ref={inputRef}
              id="csv-import-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const selected = event.target.files?.[0] ?? null;
                setFile(selected);
                setError(null);
                setResult(null);
              }}
            />
          </label>

          {file && !result && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm">
              <span className="font-bold text-foreground">{file.name}</span>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Remove selected file"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-3">
              <div
                className={cn(
                  "flex items-start gap-2 rounded-xl border p-3 text-sm font-semibold",
                  result.error_count === 0
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-amber-200 bg-amber-50 text-amber-900",
                )}
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
                <span>
                  Imported {totalCreated} item{totalCreated === 1 ? "" : "s"}
                  {result.created_count !== undefined &&
                    result.attached_count !== undefined &&
                    ` (${result.created_count} new, ${result.attached_count} re-attached)`}
                  {result.error_count > 0 &&
                    ` · ${result.error_count} row(s) skipped`}
                  .
                </span>
              </div>

              {result.errors.length > 0 && (
                <div className="rounded-xl border border-border bg-card">
                  <p className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Rows skipped
                  </p>
                  <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto px-3 pb-2 text-sm">
                    {result.errors.map((row) => (
                      <li
                        key={`err-${row.row}`}
                        className="py-1.5 font-medium text-rose-700"
                      >
                        Row {row.row}: {row.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="sticky bottom-0 flex-col gap-2 border-t border-border bg-card px-5 py-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
            className="h-11 w-full sm:w-auto"
          >
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              type="button"
              onClick={handleUpload}
              disabled={submitting || !file}
              className="h-11 w-full bg-blue-600 font-bold text-white hover:bg-blue-700 disabled:bg-slate-300 sm:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                "Import"
              )}
            </Button>
          )}
          {result && result.error_count > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={reset}
              className="h-11 w-full sm:w-auto"
            >
              Try another file
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
