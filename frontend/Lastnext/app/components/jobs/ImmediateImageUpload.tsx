"use client";

import Image from "next/image";
import axios from "axios";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, RotateCw, X } from "lucide-react";
import { BouncingDotsLoader } from "@/app/components/ui/BouncingDotsLoader";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { cn } from "@/app/lib/utils/cn";
import { useT } from "@/app/lib/i18n/LocaleProvider";

type UploadStatus = "compressing" | "uploading" | "success" | "error";

type UploadItem = {
  id: string;
  original: File;
  uploaded?: File;
  previewUrl: string;
  status: UploadStatus;
  token?: string;
  error?: string;
};

type Props = {
  imageType: "before" | "after";
  propertyId: string;
  maxFiles: number;
  disabled?: boolean;
  error?: string;
  touched?: boolean;
  onChange: (files: File[], tokens: string[]) => void;
  onBusyChange: (busy: boolean) => void;
};

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_DIMENSION = 1600;

function messageOf(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as
      | { detail?: string; image?: string | string[]; error?: string }
      | undefined;
    const imageError = Array.isArray(data?.image) ? data.image[0] : data?.image;
    return imageError || data?.detail || data?.error || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare image");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("Unable to compress image"))),
        "image/jpeg",
        0.82,
      );
    });
    const stem = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${stem}.jpg`, {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

export default function ImmediateImageUpload({
  imageType,
  propertyId,
  maxFiles,
  disabled = false,
  error,
  touched,
  onChange,
  onBusyChange,
}: Props) {
  const t = useT();
  const inputId = `immediate-image-${useId()}`;
  const cameraId = `immediate-camera-${useId()}`;
  const [items, setItems] = useState<UploadItem[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const cancelled = useRef(new Set<string>());
  const controllers = useRef(new Map<string, AbortController>());
  const itemsRef = useRef(items);
  const onChangeRef = useRef(onChange);
  const onBusyRef = useRef(onBusyChange);
  itemsRef.current = items;
  onChangeRef.current = onChange;
  onBusyRef.current = onBusyChange;

  useEffect(() => {
    const successful = items.filter((item) => item.status === "success");
    onChangeRef.current(
      successful.flatMap((item) => (item.uploaded ? [item.uploaded] : [])),
      successful.flatMap((item) => (item.token ? [item.token] : [])),
    );
    onBusyRef.current(
      items.some((item) => item.status === "compressing" || item.status === "uploading"),
    );
  }, [items]);

  useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort());
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      onBusyRef.current(false);
    },
    [],
  );

  const discardToken = useCallback((token: string) => {
    void axios.delete(`/api/jobs/pending-images?token=${encodeURIComponent(token)}`);
  }, []);

  const processItem = useCallback(
    async (id: string, original: File) => {
      const controller = new AbortController();
      controllers.current.set(id, controller);
      try {
        const compressed = await compressImage(original);
        if (cancelled.current.has(id)) return;
        setItems((current) =>
          current.map((item) =>
            item.id === id ? { ...item, uploaded: compressed, status: "uploading" } : item,
          ),
        );
        const body = new FormData();
        body.append("image", compressed);
        body.append("image_type", imageType);
        body.append("property_id", propertyId);
        const response = await axios.post<{ token: string }>(
          "/api/jobs/pending-images",
          body,
          { signal: controller.signal },
        );
        if (cancelled.current.has(id)) {
          discardToken(response.data.token);
          return;
        }
        setItems((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, status: "success", token: response.data.token, error: undefined }
              : item,
          ),
        );
      } catch (uploadError) {
        if (axios.isCancel(uploadError) || cancelled.current.has(id)) return;
        setItems((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "error",
                  error: messageOf(uploadError, t("fileUpload.uploadFailed")),
                }
              : item,
          ),
        );
      } finally {
        controllers.current.delete(id);
      }
    },
    [discardToken, imageType, propertyId, t],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      if (disabled || files.length === 0) return;
      if (itemsRef.current.length + files.length > maxFiles) {
        setValidationError(t("fileUpload.maxFiles").replace("{max}", String(maxFiles)));
        return;
      }
      const invalid = files.find(
        (file) => !file.type.startsWith("image/") || file.size > MAX_SOURCE_BYTES,
      );
      if (invalid) {
        setValidationError(
          !invalid.type.startsWith("image/")
            ? t("fileUpload.onlyImages").replace("{files}", invalid.name)
            : t("fileUpload.sourceTooLarge").replace("{file}", invalid.name),
        );
        return;
      }
      setValidationError(null);
      const additions = files.map((original) => ({
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        original,
        previewUrl: URL.createObjectURL(original),
        status: "compressing" as const,
      }));
      setItems((current) => [...current, ...additions]);
      additions.forEach((item) => void processItem(item.id, item.original));
    },
    [disabled, maxFiles, processItem, t],
  );

  const removeItem = useCallback(
    (item: UploadItem) => {
      cancelled.current.add(item.id);
      controllers.current.get(item.id)?.abort();
      if (item.token) discardToken(item.token);
      URL.revokeObjectURL(item.previewUrl);
      setItems((current) => current.filter((candidate) => candidate.id !== item.id));
      setValidationError(null);
    },
    [discardToken],
  );

  const retryItem = useCallback(
    (item: UploadItem) => {
      cancelled.current.delete(item.id);
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, status: "compressing", error: undefined }
            : candidate,
        ),
      );
      void processItem(item.id, item.original);
    },
    [processItem],
  );

  const busyCount = items.filter(
    (item) => item.status === "compressing" || item.status === "uploading",
  ).length;
  const successCount = items.filter((item) => item.status === "success").length;

  return (
    <div className="space-y-3">
      {(touched && error) || validationError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || validationError}</AlertDescription>
        </Alert>
      ) : null}

      <input
        id={inputId}
        type="file"
        className="hidden"
        multiple
        accept="image/*"
        disabled={disabled}
        onChange={(event) => {
          addFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <input
        id={cameraId}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={(event) => {
          addFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />

      <div className="rounded-xl border border-border bg-background p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {busyCount > 0 ? (
              <span>{t("fileUpload.processing").replace("{count}", String(busyCount))}</span>
            ) : successCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {t("fileUpload.uploadSuccess").replace("{count}", String(successCount))}
              </span>
            ) : (
              t("fileUpload.compressHint")
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <label htmlFor={inputId} className={cn("inline-flex min-h-11 items-center justify-center rounded-lg border border-primary/30 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/10", disabled ? "pointer-events-none opacity-60" : "cursor-pointer")}>{t("fileUpload.choosePhotos")}</label>
            <label htmlFor={cameraId} className={cn("inline-flex min-h-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary sm:hidden", disabled ? "pointer-events-none opacity-60" : "cursor-pointer")}>{t("fileUpload.takePhoto")}</label>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <div key={item.id} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
              <Image src={item.previewUrl} alt={item.original.name} fill className="object-cover" sizes="(max-width: 639px) 30vw, 90px" />
              <div className={cn("absolute inset-0 grid place-items-center", item.status === "success" ? "bg-black/10" : "bg-black/45")}>
                {item.status === "success" && <CheckCircle2 className="h-7 w-7 rounded-full bg-white text-emerald-600" />}
                {(item.status === "compressing" || item.status === "uploading") && <BouncingDotsLoader size="sm" className="text-white" />}
                {item.status === "error" && (
                  <button type="button" onClick={() => retryItem(item)} className="grid h-10 w-10 place-items-center rounded-full bg-white text-destructive" aria-label={t("fileUpload.retry")} title={item.error}>
                    <RotateCw className="h-5 w-5" />
                  </button>
                )}
              </div>
              {!disabled && (
                <button type="button" onClick={() => removeItem(item)} className="absolute right-1 top-1 z-10 grid h-9 w-9 place-items-center rounded-full bg-card/90 text-destructive shadow" aria-label={t("fileUpload.removeFile")}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {items.length < maxFiles && (
            <label htmlFor={inputId} className={cn("grid aspect-square cursor-pointer place-items-center rounded-lg border border-dashed border-primary/40 text-2xl text-primary hover:bg-primary/10", disabled && "pointer-events-none opacity-60")} aria-label={t("fileUpload.addPhotosLabel")}>+</label>
          )}
        </div>
      </div>
    </div>
  );
}
