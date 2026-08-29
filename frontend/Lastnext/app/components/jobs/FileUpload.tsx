"use client";

import React, {
  useState,
  useCallback,
  useEffect,
  ChangeEventHandler,
  useId,
  useMemo,
} from "react";
import Image from "next/image";
import { X, AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { cn } from "@/app/lib/utils/cn";
import { useT } from "@/app/lib/i18n/LocaleProvider";

function formatMessage(
  template: string,
  values: Record<string, string | number>,
) {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export interface FileUploadProps {
  onFileSelect: (files: File[]) => void;
  maxFiles?: number;
  maxSize?: number; // Max size in MB
  error?: string | undefined;
  touched?: boolean | undefined;
  disabled?: boolean;
  accept?: string;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  maxFiles = 5,
  maxSize = 5,
  error,
  touched,
  disabled = false,
}) => {
  const t = useT();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loadedPreviews, setLoadedPreviews] = useState<Record<string, boolean>>(
    {},
  );
  const generatedInputId = useId();
  const inputId = `pcms-file-input-${generatedInputId}`;
  const cameraInputId = `pcms-camera-input-${generatedInputId}`;

  const validateFiles = useCallback(
    (files: File[]): string | null => {
      if (files.length + selectedFiles.length > maxFiles) {
        return formatMessage(t("fileUpload.maxFiles"), { max: maxFiles });
      }
      // Validate type
      const invalidTypes = files.filter(
        (file) => !file.type.startsWith("image/"),
      );
      if (invalidTypes.length > 0) {
        return formatMessage(t("fileUpload.onlyImages"), {
          files: invalidTypes.map((f) => f.name).join(", "),
        });
      }
      // Validate size
      const oversizedFiles = files.filter(
        (file) => file.size > maxSize * 1024 * 1024,
      );
      if (oversizedFiles.length > 0) {
        return formatMessage(t("fileUpload.tooLarge"), {
          files: oversizedFiles.map((f) => f.name).join(", "),
          max: maxSize,
        });
      }
      return null;
    },
    [maxFiles, maxSize, selectedFiles.length, t],
  );

  const handleFiles = useCallback(
    (files: File[]) => {
      if (disabled) return;
      const currentError = validateFiles(files);
      setValidationError(currentError);

      if (!currentError) {
        const newFiles = [...selectedFiles, ...files].slice(0, maxFiles);
        setSelectedFiles(newFiles);
        setLoadedPreviews((prev) => ({
          ...prev,
          ...Object.fromEntries(files.map((file) => [file.name, false])),
        }));
        onFileSelect(newFiles);
      }
    },
    [disabled, validateFiles, selectedFiles, maxFiles, onFileSelect],
  );

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      const files = Array.from(e.target.files || []);
      handleFiles(files);
      e.target.value = ""; // Reset input
    },
    [handleFiles],
  );

  const removeFile = useCallback(
    (index: number) => {
      if (disabled) return;
      setSelectedFiles((prev) => {
        const removedFile = prev[index];
        const newFiles = prev.filter((_, i) => i !== index);
        if (removedFile) {
          setLoadedPreviews((current) => {
            const next = { ...current };
            delete next[removedFile.name];
            return next;
          });
        }
        onFileSelect(newFiles);
        return newFiles;
      });
      setValidationError(null);
    },
    [onFileSelect, disabled],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    },
    [handleFiles],
  );

  const previewUrls = useMemo(
    () => selectedFiles.map((file) => URL.createObjectURL(file)),
    [selectedFiles],
  );

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

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
        onChange={handleFileChange}
        disabled={disabled}
      />
      <input
        id={cameraInputId}
        type="file"
        className="hidden"
        multiple
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        disabled={disabled}
      />

      <div
        className={cn(
          "w-full rounded-xl border border-border bg-background p-4 transition-colors",
          isDragging && "border-primary bg-primary/10",
          disabled && "opacity-60",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="break-words text-xs leading-5 text-muted-foreground">
            {formatMessage(t("fileUpload.addPhotos"), { max: maxFiles })}{" "}
            <span>{t("fileUpload.rearrange")}</span>
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <label
              htmlFor={inputId}
              className={cn(
                "inline-flex min-h-11 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-primary/30 bg-background px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                disabled ? "pointer-events-none" : "cursor-pointer",
              )}
            >
              {t("fileUpload.choosePhotos")}
            </label>
            <label
              htmlFor={cameraInputId}
              className={cn(
                "inline-flex min-h-11 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:hidden",
                disabled ? "pointer-events-none" : "cursor-pointer",
              )}
            >
              Take photo
            </label>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-5">
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}-${file.lastModified}`}
              className="group relative aspect-square min-w-0 overflow-hidden rounded-lg border border-border bg-muted"
            >
              {!loadedPreviews[file.name] && (
                <div className="absolute inset-0 z-10 grid place-items-center bg-muted">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              )}
              <Image
                src={previewUrls[index]}
                alt={formatMessage(t("fileUpload.previewAlt"), {
                  n: index + 1,
                })}
                fill
                className={cn(
                  "object-cover transition-opacity duration-200",
                  loadedPreviews[file.name] ? "opacity-100" : "opacity-0",
                )}
                sizes="(max-width: 639px) 30vw, 90px"
                onLoad={() =>
                  setLoadedPreviews((prev) => ({ ...prev, [file.name]: true }))
                }
              />
              {!disabled && (
                <button
                  type="button"
                  className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full bg-card/90 text-destructive shadow-sm transition-colors hover:bg-card sm:h-8 sm:w-8 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                  onClick={() => removeFile(index)}
                  aria-label={t("fileUpload.removeFile")}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          {selectedFiles.length < maxFiles && (
            <label
              htmlFor={inputId}
              className={cn(
                "grid aspect-square w-full min-w-0 touch-manipulation place-items-center rounded-lg border border-dashed border-primary/40 bg-background text-2xl font-light leading-none text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                disabled ? "pointer-events-none" : "cursor-pointer",
              )}
              aria-label={t("fileUpload.addPhotosLabel")}
            >
              +
            </label>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUpload;
