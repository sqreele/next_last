"use client";

import React, { useState, useCallback, useEffect, ChangeEventHandler, useId } from "react";
import Image from "next/image";
import { Upload, X, AlertCircle, CheckCircle2, Loader2, Camera, ImagePlus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Progress } from "@/app/components/ui/progress";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { cn } from "@/app/lib/utils/cn";

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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [fileProgress, setFileProgress] = useState<{ [key: string]: number }>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loadedPreviews, setLoadedPreviews] = useState<Record<string, boolean>>({});
  const generatedInputId = useId();
  const inputId = `pcms-file-input-${generatedInputId}`;

  const validateFiles = useCallback(
    (files: File[]): string | null => {
      if (files.length + selectedFiles.length > maxFiles) {
        return `Maximum ${maxFiles} files allowed`;
      }
      // Validate type
      const invalidTypes = files.filter((file) => !file.type.startsWith("image/"));
      if (invalidTypes.length > 0) {
        return `Only image files are allowed (${invalidTypes.map(f => f.name).join(', ')})`;
      }
      // Validate size
      const oversizedFiles = files.filter((file) => file.size > maxSize * 1024 * 1024);
      if (oversizedFiles.length > 0) {
        return `File(s) too large: ${oversizedFiles.map(f => f.name).join(', ')} (Max ${maxSize}MB)`;
      }
      return null;
    },
    [maxFiles, maxSize, selectedFiles.length]
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

        // Simulate progress
        const newProgress = { ...fileProgress };
        files.forEach((file) => {
          newProgress[file.name] = 0;
        });
        setFileProgress(newProgress);

        // Simulate upload progress
        files.forEach((file) => {
          let progress = 0;
          const interval = setInterval(() => {
            progress += 10;
            setFileProgress((prev) => ({
              ...prev,
              [file.name]: progress,
            }));
            if (progress >= 100) {
              clearInterval(interval);
            }
          }, 200);
        });
      }
    },
    [disabled, validateFiles, selectedFiles, maxFiles, onFileSelect, fileProgress]
  );

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      const files = Array.from(e.target.files || []);
      handleFiles(files);
      e.target.value = ""; // Reset input
    },
    [handleFiles]
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
    [onFileSelect, disabled]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    },
    [handleFiles]
  );

  const getFilePreview = useCallback(
    (file: File) => {
      return URL.createObjectURL(file);
    },
    []
  );

  useEffect(() => {
    // Cleanup object URLs to prevent memory leaks
    return () => {
      selectedFiles.forEach((file) => {
        URL.revokeObjectURL(getFilePreview(file));
      });
    };
  }, [selectedFiles, getFilePreview]);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Display External (Formik) Error OR Internal Validation Error */}
      {(touched && error) || validationError ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || validationError}</AlertDescription>
        </Alert>
      ) : null}

      {/* Hidden file input — shared by all trigger buttons */}
      <input
        id={inputId}
        type="file"
        className="hidden"
        multiple
        accept="image/*"
        onChange={handleFileChange}
        disabled={disabled}
      />

      {/* Mobile: two large tap buttons (Camera / Gallery) */}
      <div className="grid grid-cols-2 gap-3 sm:hidden">
        <label
          htmlFor={inputId}
          className={cn(
            "flex min-h-[80px] touch-manipulation flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 px-3 py-4 text-center transition-colors active:bg-blue-100",
            disabled ? "pointer-events-none opacity-50" : "cursor-pointer"
          )}
        >
          <Camera className="h-7 w-7 text-blue-500" />
          <span className="text-xs font-semibold text-blue-700">Camera / Gallery</span>
        </label>
        <label
          htmlFor={inputId}
          className={cn(
            "flex min-h-[80px] touch-manipulation flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center transition-colors active:bg-gray-100",
            disabled ? "pointer-events-none opacity-50" : "cursor-pointer"
          )}
        >
          <ImagePlus className="h-7 w-7 text-gray-400" />
          <span className="text-xs font-semibold text-gray-600">Browse Files</span>
        </label>
      </div>

      {/* Desktop: drag-and-drop zone */}
      <div
        className={cn(
          "hidden rounded-xl border-2 border-dashed p-6 text-center transition-colors sm:block",
          isDragging ? "border-[var(--pcms-primary)] bg-[var(--pcms-primary-soft)]" : "border-gray-200",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <label
          htmlFor={inputId}
          className={cn(
            "flex flex-col items-center gap-2",
            disabled ? "pointer-events-none" : "cursor-pointer"
          )}
        >
          <Upload className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Drag &amp; drop images here, or <span className="font-semibold text-blue-600 underline">click to browse</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Max {maxFiles} files · {maxSize}MB each · Images only
          </p>
        </label>
      </div>

      {/* File Previews */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2.5 sm:space-y-3">
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}-${file.lastModified}`}
              className="group relative flex items-start gap-2.5 rounded-lg border bg-background p-2.5 sm:items-center sm:gap-3 sm:p-3"
            >
              {/* Image Preview */}
              <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded bg-slate-100 sm:h-16 sm:w-16">
                {!loadedPreviews[file.name] && (
                  <div className="absolute inset-0 z-10 grid place-items-center bg-slate-100">
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />
                  </div>
                )}
                <Image
                  src={getFilePreview(file)}
                  alt={`Preview ${index}`}
                  fill
                  className={cn("object-cover transition-opacity duration-200", loadedPreviews[file.name] ? "opacity-100" : "opacity-0")}
                  sizes="(max-width: 640px) 56px, 64px"
                  onLoad={() => setLoadedPreviews((prev) => ({ ...prev, [file.name]: true }))}
                />
              </div>
              {/* File Info & Progress */}
              <div className="flex-1 min-w-0">
                <p className="truncate pr-8 text-xs font-medium sm:pr-0 sm:text-sm" title={file.name}>
                  {file.name}
                </p>
                <p className="text-[11px] text-muted-foreground sm:text-xs">
                  {(file.size / (1024 * 1024)).toFixed(2)}MB
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <Progress
                    value={fileProgress[file.name] || (file ? 100 : 0)}
                    className="h-1 flex-1"
                  />
                  {(fileProgress[file.name] || 0) >= 100 ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-label="Ready" />
                  ) : (
                    <span className="text-[10px] font-semibold text-cyan-700">{fileProgress[file.name] || 0}%</span>
                  )}
                </div>
              </div>
              {/* Remove Button */}
              {!disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1 h-7 w-7 text-muted-foreground opacity-100 transition-opacity hover:text-destructive sm:h-6 sm:w-6 sm:opacity-0 sm:group-hover:opacity-100"
                  onClick={() => removeFile(index)}
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUpload;