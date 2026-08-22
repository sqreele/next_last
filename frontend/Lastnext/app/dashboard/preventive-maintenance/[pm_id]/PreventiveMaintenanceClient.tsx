// app/dashboard/preventive-maintenance/[pm_id]/PreventiveMaintenanceClient.tsx

"use client";
import {
  preventiveMaintenanceService,
  setPreventiveMaintenanceServiceToken,
} from "@/app/lib/PreventiveMaintenanceService";
import { useState, useMemo, useEffect, useRef, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/app/lib/session.client";
import { useMinLoaderTime } from "@/app/lib/hooks/useMinLoaderTime";
import {
  PreventiveMaintenance,
  determinePMStatus,
} from "@/app/lib/preventiveMaintenanceModels";
import {
  AlertCircle,
  Calendar,
  Clipboard,
  Wrench,
  X,
  ZoomIn,
  FileText,
  Download,
  Settings,
  Building,
  Camera,
  ArrowUpRight,
  CheckCircle,
  Clock,
  User,
  ImagePlus,
  Trash2,
  Upload,
} from "lucide-react";
import { fixImageUrl } from "@/app/lib/utils/image-utils";
import { fetchImageAsDataURL } from "@/app/lib/imageUtils";
import { MaintenanceImage } from "@/app/components/ui/UniversalImage";
import { getDisplayName, getUserEmail } from "@/app/lib/utils/display-name";
import { StatusBadge } from "@/app/components/StatusBadge";
import { useMainStore } from "@/app/lib/stores/mainStore";

interface PreventiveMaintenanceClientProps {
  maintenanceData: PreventiveMaintenance;
}

export default function PreventiveMaintenanceClient({
  maintenanceData: initialMaintenanceData,
}: PreventiveMaintenanceClientProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const selectedPropertyId = useMainStore((state) => state.selectedPropertyId);
  const [maintenanceData, setMaintenanceData] = useState(initialMaintenanceData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [currentImageAlt, setCurrentImageAlt] = useState<string>("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [uploadType, setUploadType] = useState<"before" | "after">("before");
  const [selectedImages, setSelectedImages] = useState<
    Array<{ file: File; previewUrl: string; key: string }>
  >([]);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<number | string | null>(null);
  const [imageMessage, setImageMessage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const imageModalCloseRef = useRef<HTMLButtonElement>(null);
  const imageModalTriggerRef = useRef<HTMLElement | null>(null);
  const [pdfImageDataUrls, setPdfImageDataUrls] = useState<
    Record<string, string>
  >({});
  const { recordLoaderShown, clearLoadingAfterMinTime } =
    useMinLoaderTime(setIsLoading);

  useEffect(() => {
    setMaintenanceData(initialMaintenanceData);
  }, [initialMaintenanceData]);

  useEffect(() => () => {
    previewUrlsRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
  }, []);

  useEffect(() => {
    const accessToken = session?.user?.accessToken;
    if (accessToken) {
      setPreventiveMaintenanceServiceToken(accessToken);
    }
  }, [session?.user?.accessToken]);

  const evidenceImages = useMemo(() => {
    if (maintenanceData.images?.length) {
      return maintenanceData.images
        .filter((image) => image.id !== undefined && image.image_type && image.image_url)
        .map((image) => ({ ...image, image_url: fixImageUrl(image.image_url!) }));
    }

    return [
      maintenanceData.before_image_url
        ? {
            id: "legacy-before",
            pm_id: maintenanceData.pm_id,
            image_type: "before" as const,
            image_url: fixImageUrl(maintenanceData.before_image_url),
            is_legacy: true,
          }
        : null,
      maintenanceData.after_image_url
        ? {
            id: "legacy-after",
            pm_id: maintenanceData.pm_id,
            image_type: "after" as const,
            image_url: fixImageUrl(maintenanceData.after_image_url),
            is_legacy: true,
          }
        : null,
    ].filter((image): image is NonNullable<typeof image> => Boolean(image));
  }, [maintenanceData]);

  const beforeImages = evidenceImages.filter((image) => image.image_type === "before");
  const afterImages = evidenceImages.filter((image) => image.image_type === "after");
  const imageCounts = maintenanceData.image_counts || {
    before: beforeImages.length,
    after: afterImages.length,
    total: evidenceImages.length,
    remaining: Math.max(0, 10 - evidenceImages.length),
    limit: 10,
  };
  const canOperate = (
    maintenanceData.can_operate === true
    && maintenanceData.property_id === selectedPropertyId
  );

  // ฟังก์ชันสำหรับการยืนยันการลบ
  const handleDelete = async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete this maintenance record?",
      )
    ) {
      return;
    }

    recordLoaderShown();
    setIsLoading(true);
    setError(null);

    try {
      const response =
        await preventiveMaintenanceService.deletePreventiveMaintenance(
          maintenanceData.pm_id,
        );

      if (response.success) {
        router.push("/dashboard/preventive-maintenance");
        router.refresh();
      } else {
        throw new Error(
          response.message || "Failed to delete maintenance record",
        );
      }
    } catch (err: any) {
      console.error("Error deleting maintenance:", err);
      setError(err.message || "An error occurred while deleting");
    } finally {
      clearLoadingAfterMinTime();
    }
  };

  // Function to mark maintenance as complete
  const handleMarkComplete = async () => {
    if (!window.confirm("Mark this maintenance task as completed?")) {
      return;
    }

    setIsCompleting(true);
    setError(null);

    try {
      // Validate that completion date is within 15 days before or after scheduled date
      const scheduledDate = maintenanceData.scheduled_date
        ? new Date(maintenanceData.scheduled_date)
        : null;
      const completedDate = new Date();

      if (scheduledDate) {
        const daysDiff = Math.floor(
          (completedDate.getTime() - scheduledDate.getTime()) /
            (1000 * 60 * 60 * 24),
        );

        if (daysDiff < -15 || daysDiff > 15) {
          const scheduledDateStr = scheduledDate.toLocaleDateString();
          const completedDateStr = completedDate.toLocaleDateString();
          const proceed = window.confirm(
            `This task is outside the recommended 15-day window.\n\n` +
              `Scheduled: ${scheduledDateStr}\n` +
              `Completion: ${completedDateStr}\n` +
              `Difference: ${Math.abs(daysDiff)} days\n\n` +
              `Do you still want to mark it complete?`,
          );

          if (!proceed) {
            setIsCompleting(false);
            return;
          }
        }
      }

      const response =
        await preventiveMaintenanceService.completePreventiveMaintenance(
          maintenanceData.pm_id,
          {
            completed_date: completedDate.toISOString(),
          },
        );

      if (response.success) {
        // Get the updated data from response
        const updatedData = response.data;
        const nextScheduledDate =
          updatedData?.scheduled_date || updatedData?.next_due_date;

        // Show success message with next scheduled date
        if (nextScheduledDate) {
          const nextDate = new Date(nextScheduledDate);
          const formattedDate = nextDate.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });

          // Show success message
          alert(
            `✅ Maintenance task completed successfully!\n\nNext scheduled maintenance: ${formattedDate}`,
          );
        } else {
          alert("✅ Maintenance task completed successfully!");
        }

        router.refresh();
      } else {
        throw new Error(
          response.message || "Failed to complete maintenance record",
        );
      }
    } catch (err: any) {
      console.error("Error completing maintenance:", err);
      setError(err.message || "An error occurred while marking as complete");
    } finally {
      setIsCompleting(false);
    }
  };

  // Image URL functions
  const getBeforeImageUrl = (): string | null => {
    return beforeImages[0]?.image_url || null;
  };

  const getAfterImageUrl = (): string | null => {
    return afterImages[0]?.image_url || null;
  };

  // Open image in modal
  const openImageModal = (imageUrl: string | null, altText: string) => {
    if (!imageUrl) return;
    imageModalTriggerRef.current = document.activeElement as HTMLElement | null;
    setCurrentImage(imageUrl);
    setCurrentImageAlt(altText);
    setIsImageModalOpen(true);
  };

  const closeImageModal = () => {
    setIsImageModalOpen(false);
    setCurrentImage(null);
    requestAnimationFrame(() => imageModalTriggerRef.current?.focus());
  };

  useEffect(() => {
    if (!isImageModalOpen) return;
    imageModalCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault();
        imageModalCloseRef.current?.focus();
        return;
      }
      if (event.key === "Escape") {
        setIsImageModalOpen(false);
        setCurrentImage(null);
        requestAnimationFrame(() => imageModalTriggerRef.current?.focus());
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isImageModalOpen]);

  const clearSelectedImages = () => {
    selectedImages.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    previewUrlsRef.current = [];
    setSelectedImages([]);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleImageSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    setImageMessage(null);
    if (files.length === 0) return;
    if (selectedImages.length + files.length > imageCounts.remaining) {
      setImageMessage(`You can select up to ${imageCounts.remaining} more image${imageCounts.remaining === 1 ? "" : "s"}.`);
      event.target.value = "";
      return;
    }

    const existingKeys = new Set(selectedImages.map(({ key }) => key));
    const additions = files.flatMap((file) => {
      const key = `${file.name}-${file.size}-${file.lastModified}`;
      if (existingKeys.has(key)) return [];
      existingKeys.add(key);
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.push(previewUrl);
      return [{ file, previewUrl, key }];
    });
    setSelectedImages((current) => [...current, ...additions]);
    event.target.value = "";
  };

  const removeSelectedImage = (key: string) => {
    setSelectedImages((current) => {
      const removed = current.find((item) => item.key === key);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
        previewUrlsRef.current = previewUrlsRef.current.filter((url) => url !== removed.previewUrl);
      }
      return current.filter((item) => item.key !== key);
    });
  };

  const handleUploadImages = async () => {
    const propertyId = selectedPropertyId;
    if (!canOperate || !propertyId || selectedImages.length === 0) return;
    setIsUploadingImages(true);
    setImageMessage(null);
    try {
      const response = await preventiveMaintenanceService.uploadMaintenanceImages(
        maintenanceData.pm_id,
        { images: selectedImages.map(({ file }) => file), image_type: uploadType },
        propertyId,
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || "Unable to upload images.");
      }
      if (useMainStore.getState().selectedPropertyId !== propertyId) return;
      setMaintenanceData(response.data);
      clearSelectedImages();
      setImageMessage("Images uploaded and optimized successfully.");
    } catch (uploadError: unknown) {
      setImageMessage(uploadError instanceof Error ? uploadError.message : "Unable to upload images.");
    } finally {
      setIsUploadingImages(false);
    }
  };

  const handleDeleteImage = async (imageId: number | string) => {
    const propertyId = selectedPropertyId;
    if (!canOperate || !propertyId || !window.confirm("Delete this maintenance image?")) return;
    setDeletingImageId(imageId);
    setImageMessage(null);
    try {
      const response = await preventiveMaintenanceService.deleteMaintenanceImage(
        maintenanceData.pm_id,
        imageId,
        propertyId,
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || "Unable to delete this image.");
      }
      if (useMainStore.getState().selectedPropertyId !== propertyId) return;
      setMaintenanceData(response.data);
      setImageMessage("Image deleted.");
    } catch (deleteError: unknown) {
      setImageMessage(deleteError instanceof Error ? deleteError.message : "Unable to delete this image.");
    } finally {
      setDeletingImageId(null);
    }
  };

  const waitForPdfImages = async (root: HTMLElement) => {
    const images = Array.from(root.querySelectorAll("img"));
    await Promise.all(
      images.map((image) => {
        if (image.complete && image.naturalWidth > 0) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, 6000);
          const done = () => {
            window.clearTimeout(timeout);
            resolve();
          };
          image.onload = done;
          image.onerror = done;
        });
      }),
    );
  };

  const preparePdfImages = async () => {
    const machineImageUrls = machinesWithImages
      .map(({ imageUrl }) => imageUrl)
      .filter((url): url is string => !!url);

    const imageUrls = Array.from(
      new Set(
        [beforeImageUrl, afterImageUrl, ...machineImageUrls].filter(
          (url): url is string => !!url,
        ),
      ),
    );

    if (imageUrls.length === 0) return;

    const convertedEntries = await Promise.all(
      imageUrls.map(async (url) => {
        if (pdfImageDataUrls[url]) {
          return [url, pdfImageDataUrls[url]] as const;
        }

        try {
          const dataUrl = await fetchImageAsDataURL(url, {
            retries: 1,
            timeout: 10000,
            useProxy: url.startsWith("http"),
            maxSize: 1200,
            quality: 0.82,
          });
          return [url, dataUrl] as const;
        } catch (error) {
          console.warn("[PM PDF] Failed to prepare image for PDF:", url, error);
          return null;
        }
      }),
    );

    const nextDataUrls = convertedEntries.reduce<Record<string, string>>(
      (acc, entry) => {
        if (entry) {
          acc[entry[0]] = entry[1];
        }
        return acc;
      },
      {},
    );

    if (Object.keys(nextDataUrls).length > 0) {
      setPdfImageDataUrls((current) => ({ ...current, ...nextDataUrls }));
    }
  };

  const getPdfImageSrc = (imageUrl: string | null | undefined) => {
    if (!imageUrl) return "";
    return pdfImageDataUrls[imageUrl] || imageUrl;
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    setError(null);

    const pdfContent = document.getElementById("pdf-content");
    if (!pdfContent) {
      setError("PDF content not found.");
      setIsExportingPdf(false);
      return;
    }

    const originalDisplay = pdfContent.style.display;
    const originalPosition = pdfContent.style.position;
    const originalLeft = pdfContent.style.left;
    const originalTop = pdfContent.style.top;
    const originalZIndex = pdfContent.style.zIndex;

    try {
      pdfContent.style.display = "block";
      pdfContent.style.position = "fixed";
      pdfContent.style.left = "-99999px";
      pdfContent.style.top = "0";
      pdfContent.style.zIndex = "-1";

      await preparePdfImages();
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      await waitForPdfImages(pdfContent);

      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(pdfContent, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const pdf = new jsPDF("p", "mm", "a4");
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const targetWidth = pageWidth - margin * 2;
      const targetHeight = pageHeight - margin * 2;
      const pxPerMm = canvas.width / targetWidth;
      const pageCanvasHeight = Math.floor(targetHeight * pxPerMm);

      let pageIndex = 0;
      let yOffset = 0;

      while (yOffset < canvas.height) {
        const sliceHeight = Math.min(pageCanvasHeight, canvas.height - yOffset);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;

        const context = pageCanvas.getContext("2d");
        if (!context) {
          throw new Error("Failed to create canvas context for PDF export.");
        }

        context.drawImage(
          canvas,
          0,
          yOffset,
          canvas.width,
          sliceHeight,
          0,
          0,
          canvas.width,
          sliceHeight,
        );

        const imageData = pageCanvas.toDataURL("image/png");
        const renderedHeight = (sliceHeight * targetWidth) / canvas.width;

        if (pageIndex > 0) {
          pdf.addPage();
        }

        pdf.addImage(
          imageData,
          "PNG",
          margin,
          margin,
          targetWidth,
          renderedHeight,
        );
        yOffset += sliceHeight;
        pageIndex += 1;
      }

      const generatedDate = new Date().toISOString().slice(0, 10);
      pdf.save(
        `preventive-maintenance-${maintenanceData.pm_id}-${generatedDate}.pdf`,
      );
    } catch (err: any) {
      console.error("Error exporting PDF:", err);
      setError(err?.message || "Failed to export PDF.");
    } finally {
      pdfContent.style.display = originalDisplay;
      pdfContent.style.position = originalPosition;
      pdfContent.style.left = originalLeft;
      pdfContent.style.top = originalTop;
      pdfContent.style.zIndex = originalZIndex;
      setIsExportingPdf(false);
    }
  };

  // Debug: Log the full maintenance data structure

  const beforeImageUrl = getBeforeImageUrl();
  const afterImageUrl = getAfterImageUrl();

  const assignedUserInfo = useMemo(() => {
    if (maintenanceData.assigned_to_details) {
      const details = maintenanceData.assigned_to_details;
      const display = getDisplayName(details, "Unknown Technician");
      if (display !== "Unknown Technician") {
        return {
          display,
          email: details.email,
        };
      }
    }

    const namedAssignee =
      maintenanceData.assigned_to_name || maintenanceData.technician_name;
    if (namedAssignee && namedAssignee !== "Unknown Technician") {
      return {
        display: namedAssignee,
        email: getUserEmail(
          maintenanceData.assigned_to_details || maintenanceData.assigned_to,
        ),
      };
    }

    const assignee = maintenanceData.assigned_to as any;
    if (assignee && typeof assignee === "object") {
      return {
        display: getDisplayName(assignee, "Unknown Technician"),
        email: assignee.email,
      };
    }

    if (
      typeof maintenanceData.assigned_to === "number" ||
      typeof maintenanceData.assigned_to === "string"
    ) {
      return {
        display: getDisplayName(
          maintenanceData.assigned_to,
          "Unknown Technician",
        ),
        email: undefined,
      };
    }

    return null;
  }, [
    maintenanceData.assigned_to,
    maintenanceData.assigned_to_details,
    maintenanceData.assigned_to_name,
    maintenanceData.technician_name,
  ]);

  // Debug logging in useEffect to avoid hydration issues
  useEffect(() => {
    if (!assignedUserInfo) {
      console.warn(
        "⚠️ [CLIENT] No assigned user info found. Check if assigned_to or assigned_to_details is populated in API response.",
      );
    }
  }, [maintenanceData, beforeImageUrl, afterImageUrl, assignedUserInfo]);

  // Helper function to format dates
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A";

    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return "Invalid Date";

      // Use a completely locale-independent format to avoid hydration issues
      const year = date.getFullYear();
      const monthNames = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ];
      const month = monthNames[date.getMonth()];
      const day = date.getDate();
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const ampm = hours >= 12 ? "PM" : "AM";
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes.toString().padStart(2, "0");

      return `${month} ${day}, ${year} at ${displayHours}:${displayMinutes} ${ampm}`;
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Invalid Date";
    }
  };

  // Helper function to format current date/time for reports (locale-independent)
  const formatCurrentDateTime = () => {
    const now = new Date();
    const year = now.getFullYear();
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const month = monthNames[now.getMonth()];
    const day = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, "0");

    return `${month} ${day}, ${year} at ${displayHours}:${displayMinutes} ${ampm}`;
  };

  // Helper function to format current date for reports (locale-independent)
  const formatCurrentDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = monthNames[now.getMonth()];
    const day = now.getDate();

    return `${month} ${day}, ${year}`;
  };

  // Status functions - use useState/useEffect to avoid hydration issues with Date.now()
  // Initialize with a safe default that won't cause hydration mismatch
  const [taskStatus, setTaskStatus] = useState("pending");

  // Calculate status only on client side to avoid hydration issues
  useEffect(() => {
    if (maintenanceData.completed_date) {
      setTaskStatus("completed");
      return;
    }

    setTaskStatus(determinePMStatus(maintenanceData));
  }, [
    maintenanceData.completed_date,
    maintenanceData.scheduled_date,
    maintenanceData,
  ]);

  const getTaskStatus = taskStatus;

  // Render machine list
  const renderMachines = () => {
    // More robust check for empty machines
    const machines = maintenanceData.machines;
    const machinesList = Array.isArray(machines) ? machines : null;
    const hasMachines = !!machinesList && machinesList.length > 0;

    // Debug logging to help diagnose machine assignment issues

    if (!machinesList || machinesList.length === 0) {
      return (
        <div className="text-center py-8">
          <Wrench className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground font-medium">
            No machines assigned
          </p>
          <p className="text-muted-foreground text-sm mb-4">
            This maintenance task is not associated with any specific machines.
            Machines are optional but help track which equipment this
            maintenance applies to.
          </p>
          <Link
            href={`/dashboard/preventive-maintenance/edit/${maintenanceData.pm_id}`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <Settings className="h-4 w-4" />
            Add Machines to This Task
          </Link>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {machinesList.map((machine, index) => {
          const machineId =
            typeof machine === "object" ? machine.machine_id : machine;
          const machineName = typeof machine === "object" ? machine.name : null;
          const machineImageUrl =
            typeof machine === "object" ? getMachineImageUrl(machine) : null;

          return (
            <div
              key={index}
              className="bg-gradient-to-r from-slate-50 to-gray-50 p-4 rounded-xl border border-border hover:shadow-soft transition-all duration-200"
            >
              <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                {machineImageUrl ? (
                  <button
                    type="button"
                    onClick={() =>
                      openImageModal(
                        machineImageUrl,
                        `${machineName || "Machine"} image`,
                      )
                    }
                    className="group relative h-20 w-20 flex-none overflow-hidden rounded-xl border border-border bg-muted shadow-soft focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label={`Open image for ${machineName || machineId || "machine"}`}
                  >
                    <img
                      loading="lazy"
                      decoding="async"
                      src={machineImageUrl}
                      alt={machineName ? `${machineName} machine` : "Machine"}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-200 group-hover:bg-black/20 group-hover:opacity-100">
                      <ZoomIn className="h-5 w-5 text-white" />
                    </span>
                  </button>
                ) : (
                  <div className="grid h-20 w-20 flex-none place-items-center rounded-xl border border-dashed border-border bg-muted">
                    <Wrench className="h-7 w-7 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="break-words font-semibold text-foreground">
                    {machineName || "Unnamed Machine"}
                  </p>
                  <p className="break-all font-mono text-xs text-muted-foreground sm:text-sm">
                    {machineId}
                  </p>
                  {machineId && (
                    <Link
                      href={`/dashboard/machines/${encodeURIComponent(String(machineId))}`}
                      className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                    >
                      View machine
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const getMachinesString = () => {
    if (!maintenanceData.machines || maintenanceData.machines.length === 0) {
      return "No machines assigned";
    }

    return maintenanceData.machines
      .map((machine) => {
        if (typeof machine === "string") {
          return machine;
        }
        const machineWithLocation = machine as any;
        const name = machine.name || machine.machine_id;
        const location = machineWithLocation.location
          ? ` (${machineWithLocation.location})`
          : "";
        return `${name}${location}`;
      })
      .join(", ");
  };

  const getMachineImageUrl = (
    machine: NonNullable<PreventiveMaintenance["machines"]>[number],
  ): string | null => {
    const rawImageUrl = machine.image_url || machine.image;
    return rawImageUrl ? fixImageUrl(rawImageUrl) : null;
  };

  const machinesWithImages = useMemo(() => {
    if (!maintenanceData.machines || !Array.isArray(maintenanceData.machines))
      return [];

    return maintenanceData.machines
      .filter((machine) => getMachineImageUrl(machine))
      .map((machine) => ({
        machine,
        imageUrl: getMachineImageUrl(machine),
      }));
  }, [maintenanceData.machines]);

  // getTopicsString function removed - topics no longer displayed
  // const getTopicsString = () => {
  //   const topics = maintenanceData.topics;
  //   if (!topics || topics.length === 0) return 'No topics';
  //
  //   if (typeof topics[0] === 'object' && 'title' in topics[0]) {
  //     return (topics as any[]).map(topic => topic.title).join(', ');
  //   }
  //
  //   // Handle case where topics are numbers (IDs)
  //   return (topics as unknown as number[]).join(', ');
  // };

  return (
    <>
      <nav
        className="pcms-section-card mb-4 p-3 sm:p-4"
        aria-label="Easy preventive maintenance menu"
      >
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-muted-foreground">
          Easy menu
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Link
            href="/dashboard/preventive-maintenance"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground transition-colors hover:bg-muted"
          >
            <ArrowUpRight
              className="h-4 w-4 rotate-180"
              aria-hidden="true"
            />
            PM List
          </Link>

          {canOperate && (
            <Link
              href={`/dashboard/preventive-maintenance/edit/${maintenanceData.pm_id}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground transition-colors hover:bg-muted"
            >
              <Settings className="h-4 w-4" aria-hidden="true" />
              Edit
            </Link>
          )}

          <button
            type="button"
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {isExportingPdf ? "Generating..." : "PDF"}
          </button>

          {canOperate && !maintenanceData.completed_date && maintenanceData.status !== "cancelled" && (
            <button
              type="button"
              onClick={handleMarkComplete}
              disabled={isCompleting}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-green-300 bg-green-50 px-3 py-2 text-sm font-bold text-green-800 transition-colors hover:bg-green-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" aria-hidden="true" />
              {isCompleting ? "Completing..." : "Complete"}
            </button>
          )}
        </div>
      </nav>

      <div className="overflow-hidden rounded-xl border border-[var(--pcms-border)] bg-card shadow-[var(--pcms-shadow-soft)]">
        {/* Modern Header */}
        <div className="border-b border-[var(--pcms-border)] bg-[var(--pcms-surface-soft)] px-4 py-4 sm:px-8 sm:py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
              <div className="shrink-0 rounded-xl bg-blue-100 p-2.5 sm:p-3">
                <Wrench className="h-6 w-6 text-blue-600 sm:h-8 sm:w-8" />
              </div>
              <div className="min-w-0">
                <h1 className="break-words text-xl font-bold leading-tight text-foreground sm:text-2xl">
                  {maintenanceData.pmtitle || "Preventive Maintenance"}
                </h1>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground sm:text-sm">
                  ID: {maintenanceData.pm_id}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StatusBadge status={taskStatus} />
            </div>
          </div>

          {/* Modern Metadata Cards */}
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-[var(--pcms-border)] bg-card p-4 shadow-[var(--pcms-shadow-soft)] transition-shadow hover:shadow-[var(--pcms-shadow)]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clipboard className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Maintenance ID
                  </p>
                  <p className="break-all font-mono text-base font-semibold text-foreground sm:text-lg">
                    {maintenanceData.pm_id}
                  </p>
                </div>
              </div>
            </div>

            {/* Always show Task Template card - with link if exists, or message if not */}
            <div className="rounded-xl border border-[var(--pcms-border)] bg-card p-4 shadow-[var(--pcms-shadow-soft)] transition-shadow hover:shadow-[var(--pcms-shadow)]">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2 rounded-lg ${maintenanceData.procedure_template_id || maintenanceData.procedure_template ? "bg-indigo-100" : "bg-muted"}`}
                >
                  <Settings
                    className={`h-5 w-5 ${maintenanceData.procedure_template_id || maintenanceData.procedure_template ? "text-indigo-600" : "text-muted-foreground"}`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    Maintenance Task Template
                  </p>
                  {maintenanceData.procedure_template_id ||
                  maintenanceData.procedure_template ? (
                    <>
                      <Link
                        href={`/dashboard/maintenance-tasks/${maintenanceData.procedure_template_id || maintenanceData.procedure_template}`}
                        className="flex items-start gap-1 break-all font-mono text-base font-semibold text-indigo-600 hover:text-indigo-800 hover:underline sm:text-lg"
                      >
                        {maintenanceData.procedure_template_id ||
                          maintenanceData.procedure_template}
                        <ArrowUpRight className="mt-1 h-4 w-4 shrink-0" />
                      </Link>
                      {maintenanceData.procedure_template_name && (
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          {maintenanceData.procedure_template_name}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground italic">
                        No template linked
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        <Link
                          href={`/dashboard/preventive-maintenance/edit/${maintenanceData.pm_id}`}
                          className="text-blue-600 hover:underline"
                        >
                          Edit this record
                        </Link>{" "}
                        to link a task template
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {maintenanceData.property_id && (
              <div className="rounded-xl border border-[var(--pcms-border)] bg-card p-4 shadow-[var(--pcms-shadow-soft)] transition-shadow hover:shadow-[var(--pcms-shadow)]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <Building className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Property ID
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {Array.isArray(maintenanceData.property_id)
                        ? maintenanceData.property_id.join(", ")
                        : maintenanceData.property_id}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {assignedUserInfo && (
              <div className="rounded-xl border border-[var(--pcms-border)] bg-card p-4 shadow-[var(--pcms-shadow-soft)] transition-shadow hover:shadow-[var(--pcms-shadow)]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-sky-100 rounded-lg">
                    <User className="h-5 w-5 text-sky-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Assigned To
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {assignedUserInfo.display}
                    </p>
                    {assignedUserInfo.email && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {assignedUserInfo.email}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="bg-card p-4 rounded-xl border border-border shadow-soft hover:shadow-soft transition-shadow">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Scheduled
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatDate(maintenanceData.scheduled_date)}
                  </p>
                </div>
              </div>
            </div>

            {(maintenanceData.completed_date || taskStatus === "completed") && (
              <div className="rounded-xl border border-[var(--pcms-border)] bg-card p-4 shadow-[var(--pcms-shadow-soft)] transition-shadow hover:shadow-[var(--pcms-shadow)]">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Completed
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {maintenanceData.completed_date
                        ? formatDate(maintenanceData.completed_date)
                        : "Completion date not set"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {maintenanceData.next_due_date && (
              <div className="bg-card p-4 rounded-xl border border-border shadow-soft hover:shadow-soft transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <Clock className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Next Due
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      {formatDate(maintenanceData.next_due_date)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modern Maintenance Details Section */}
        <div className="px-4 py-4 sm:px-8 sm:py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Maintenance Title */}
              <div className="rounded-xl border border-[var(--pcms-border)] bg-card p-4 shadow-[var(--pcms-shadow-soft)] sm:p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <FileText className="h-5 w-5 text-blue-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-foreground">
                    Maintenance Title
                  </h4>
                </div>
                <p className="break-words text-base font-medium leading-relaxed text-foreground sm:text-xl">
                  {maintenanceData.pmtitle || "No title provided"}
                </p>
              </div>

              {/* Maintenance Procedure */}
              {maintenanceData.procedure && (
                <div className="rounded-xl border border-[var(--pcms-border)] bg-card p-4 shadow-[var(--pcms-shadow-soft)] sm:p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Clipboard className="h-5 w-5 text-green-600" />
                    </div>
                    <h4 className="text-lg font-semibold text-foreground">
                      Procedure
                    </h4>
                  </div>
                  <div className="bg-card/60 p-4 rounded-xl">
                    <p className="break-words whitespace-pre-wrap text-foreground leading-relaxed">
                      {maintenanceData.procedure}
                    </p>
                  </div>
                </div>
              )}

              {/* Notes */}
              {maintenanceData.notes && (
                <div className="rounded-xl border border-[var(--pcms-border)] bg-card p-4 shadow-[var(--pcms-shadow-soft)] sm:p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <FileText className="h-5 w-5 text-purple-600" />
                    </div>
                    <h4 className="text-lg font-semibold text-foreground">
                      Notes
                    </h4>
                  </div>
                  <div className="bg-card/60 p-4 rounded-xl">
                    <p className="break-words whitespace-pre-wrap text-foreground leading-relaxed">
                      {maintenanceData.notes}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-6"></div>
          </div>
        </div>

        {/* Modern Machines Section */}
        <div className="border-t border-border px-4 py-4 sm:px-8 sm:py-6">
          <div className="rounded-xl border border-[var(--pcms-border)] bg-card p-4 shadow-[var(--pcms-shadow-soft)] sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-muted rounded-lg">
                <Wrench className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">
                Associated Machines
              </h3>
            </div>
            <div className="rounded-xl bg-card/80 p-0 sm:p-4">
              {renderMachines()}
            </div>
          </div>
        </div>

        {/* PM evidence gallery */}
        <section className="border-t border-border px-4 py-4 sm:px-8 sm:py-6" aria-labelledby="pm-images-title">
          <div className="rounded-xl border border-[var(--pcms-border)] bg-card p-4 shadow-[var(--pcms-shadow-soft)] sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 p-2">
                  <Camera className="h-6 w-6 text-amber-700" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="pm-images-title" className="text-xl font-semibold text-foreground">Work evidence</h2>
                  <p className="text-sm text-muted-foreground">Before: {imageCounts.before} · After: {imageCounts.after}</p>
                </div>
              </div>
              <p className="rounded-full bg-muted px-3 py-1.5 text-sm font-semibold text-foreground" aria-label={`${imageCounts.total} of ${imageCounts.limit} images used`}>
                {imageCounts.total} / {imageCounts.limit} images
              </p>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {([
                { type: "before" as const, title: "Before Work", images: beforeImages, accent: "bg-blue-500" },
                { type: "after" as const, title: "After Work", images: afterImages, accent: "bg-green-500" },
              ]).map((group) => (
                <div key={group.type} className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 font-semibold text-foreground">
                      <span className={`h-2.5 w-2.5 rounded-full ${group.accent}`} aria-hidden="true" />
                      {group.title}
                    </h3>
                    <span className="text-sm text-muted-foreground">{group.images.length}</span>
                  </div>
                  {group.images.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                      {group.images.map((image, index) => {
                        const alt = `${group.type === "before" ? "Before" : "After"} maintenance image ${index + 1}`;
                        return (
                          <div key={String(image.id)} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                            <button
                              type="button"
                              onClick={() => openImageModal(image.image_url || null, alt)}
                              className="h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-inset"
                              aria-label={`Open ${alt.toLowerCase()}`}
                            >
                              <img loading="lazy" decoding="async" src={image.image_url || ""} alt={alt} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                              <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition group-hover:bg-black/20 group-hover:opacity-100" aria-hidden="true">
                                <ZoomIn className="h-6 w-6 text-white" />
                              </span>
                            </button>
                            {canOperate && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteImage(image.id!)}
                                disabled={deletingImageId === image.id}
                                className="absolute right-1.5 top-1.5 grid h-11 w-11 place-items-center rounded-full bg-red-700 text-white shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
                                aria-label={`Delete ${alt.toLowerCase()}`}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid min-h-36 place-items-center rounded-lg border-2 border-dashed border-border bg-card px-4 text-center">
                      <div>
                        <ImagePlus className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
                        <p className="mt-2 text-sm font-medium text-muted-foreground">No {group.type} images yet</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {canOperate && (
              <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <Upload className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-foreground">Add work images</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Choose Before or After. Images are automatically optimized before storage.</p>
                  </div>
                </div>

                {imageCounts.remaining > 0 ? (
                  <>
                    <fieldset className="mt-4">
                      <legend className="text-sm font-semibold text-foreground">Image type</legend>
                      <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-sm">
                        {(["before", "after"] as const).map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setUploadType(type)}
                            aria-pressed={uploadType === type}
                            className={`min-h-11 rounded-lg border px-4 py-2 text-sm font-semibold capitalize focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${uploadType === type ? "border-blue-700 bg-blue-700 text-white" : "border-border bg-card text-foreground"}`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <label className="mt-4 block text-sm font-semibold text-foreground" htmlFor="pm-evidence-images">
                      Select images <span className="font-normal text-muted-foreground">({imageCounts.remaining} remaining)</span>
                    </label>
                    <input
                      ref={imageInputRef}
                      id="pm-evidence-images"
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      multiple
                      onChange={handleImageSelection}
                      disabled={isUploadingImages}
                      className="mt-2 block min-h-11 w-full rounded-lg border border-border bg-card p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-blue-100 file:px-3 file:py-2 file:font-semibold file:text-blue-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    />
                  </>
                ) : (
                  <p className="mt-4 rounded-lg bg-amber-100 px-4 py-3 text-sm font-medium text-amber-950">The 10-image limit has been reached. Delete an image to add another.</p>
                )}

                {selectedImages.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-semibold text-foreground">Selected: {selectedImages.length}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {selectedImages.map(({ file, previewUrl, key }, index) => (
                        <div key={key} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                          <img src={previewUrl} alt={`Selected image ${index + 1}: ${file.name}`} className="h-full w-full object-cover" />
                          <button type="button" onClick={() => removeSelectedImage(key)} className="absolute right-1 top-1 grid h-11 w-11 place-items-center rounded-full bg-black/75 text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white" aria-label={`Remove ${file.name} from upload`}>
                            <X className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleUploadImages()}
                      disabled={isUploadingImages}
                      className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                      <Upload className="h-4 w-4" aria-hidden="true" />
                      {isUploadingImages ? "Uploading and optimizing…" : `Upload ${selectedImages.length} ${uploadType} image${selectedImages.length === 1 ? "" : "s"}`}
                    </button>
                  </div>
                )}

                {imageMessage && <p className="mt-3 text-sm font-medium text-foreground" role="status" aria-live="polite">{imageMessage}</p>}
              </div>
            )}
          </div>
        </section>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 flex items-center">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Modern Action Buttons */}
        <div className="border-t border-border bg-muted px-4 py-4 sm:px-8 sm:py-6">
          <div className="flex flex-col sm:flex-row justify-between gap-4">
            <Link
              href="/dashboard/preventive-maintenance"
              className="flex items-center justify-center gap-2 px-6 py-3 bg-card text-muted-foreground rounded-xl hover:bg-muted focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 text-center font-medium border border-border shadow-soft hover:shadow-soft transition-all duration-200"
            >
              <ArrowUpRight className="h-4 w-4 rotate-180" />
              Back to List
            </Link>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleExportPdf}
                disabled={isExportingPdf}
                className={`pcms-btn pcms-btn-primary flex items-center justify-center gap-2 px-6 py-3 ${
                  isExportingPdf ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                <Download className="h-4 w-4" />
                {isExportingPdf ? "Generating PDF report..." : "Generate PDF"}
              </button>

              {canOperate && !maintenanceData.completed_date && maintenanceData.status !== "cancelled" && (
                <button
                  onClick={handleMarkComplete}
                  disabled={isCompleting}
                  className={`pcms-btn pcms-btn-success flex items-center justify-center gap-2 px-6 py-3 ${
                    isCompleting ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <CheckCircle className="h-4 w-4" />
                  {isCompleting ? "Completing..." : "Mark Complete"}
                </button>
              )}

              {canOperate && (
                <Link
                  href={`/dashboard/preventive-maintenance/edit/${maintenanceData.pm_id}`}
                  className="pcms-btn pcms-btn-primary flex items-center justify-center gap-2 px-6 py-3 text-center font-medium"
                >
                  <Settings className="h-4 w-4" />
                  Edit
                </Link>
              )}

              {canOperate && (
                <button
                  onClick={handleDelete}
                  disabled={isLoading}
                  className={`pcms-btn pcms-btn-danger flex items-center justify-center gap-2 px-6 py-3 font-medium ${
                    isLoading ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                >
                  <X className="h-4 w-4" />
                  {isLoading ? "Deleting..." : "Delete"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* A4 PDF Content (Hidden on screen, visible when printing) */}
      <div id="pdf-content" className="hidden print:block">
        {/* A4 Paper Container */}
        <div
          className="a4-page bg-card mx-auto"
          style={{
            width: "210mm",
            minHeight: "297mm",
            padding: "12mm",
            boxSizing: "border-box",
          }}
        >
          {/* Header */}
          <div className="header text-center mb-4 border-b-2 border-border pb-4">
            <h1 className="text-2xl font-bold text-foreground mb-1">
              Maintenance Record Report
            </h1>
            <p className="text-muted-foreground">
              Generated on {formatCurrentDateTime()}
            </p>
            <div className="flex justify-center items-center mt-2 text-xs text-muted-foreground">
              <Building className="h-4 w-4 mr-2" />
              Facility Management System
            </div>
          </div>

          {/* Maintenance Details */}
          <div className="maintenance-item border border-border rounded-lg p-4 mb-4 text-sm">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h2 className="text-xl font-semibold text-foreground">
                  {maintenanceData.pmtitle || "Maintenance Task"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  ID: {maintenanceData.pm_id}
                </p>
              </div>
              <StatusBadge status={getTaskStatus} />
            </div>

            {(maintenanceData as any).job_description && (
              <div className="mb-4">
                <span className="font-medium text-muted-foreground">
                  Description:
                </span>
                <p className="text-muted-foreground mt-1">
                  {(maintenanceData as any).job_description}
                </p>
              </div>
            )}

            {maintenanceData.notes && (
              <div className="mb-4">
                <span className="font-medium text-muted-foreground">
                  Notes:
                </span>
                <p className="text-muted-foreground mt-1">
                  {maintenanceData.notes}
                </p>
              </div>
            )}

            {maintenanceData.procedure && (
              <div className="mb-4">
                <span className="font-medium text-muted-foreground">
                  Procedure:
                </span>
                <p className="text-muted-foreground mt-1 whitespace-pre-wrap">
                  {maintenanceData.procedure}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs mb-3">
              <div>
                <span className="font-medium text-muted-foreground">
                  Scheduled:
                </span>
                <p>{formatDate(maintenanceData.scheduled_date)}</p>
              </div>
              {/* Frequency removed from display - defaults to monthly */}
              {/* Topics removed from display */}
              <div>
                <span className="font-medium text-muted-foreground">
                  Next Due:
                </span>
                <p>
                  {maintenanceData.next_due_date
                    ? formatDate(maintenanceData.next_due_date)
                    : "N/A"}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <span className="font-medium text-muted-foreground">
                Machines:
              </span>
              <p className="text-muted-foreground mt-1">
                {getMachinesString()}
              </p>
            </div>

            {machinesWithImages.length > 0 && (
              <div className="mb-4">
                <span className="font-medium text-muted-foreground">
                  Equipment Images:
                </span>
                <div className="pdf-image-grid grid grid-cols-2 gap-3 mt-2">
                  {machinesWithImages.map(({ machine, imageUrl }, index) => (
                    <div
                      key={`${machine.machine_id || index}-pdf-equipment-image`}
                      className="pdf-image-card rounded-lg border border-border p-2"
                    >
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        {machine.name ||
                          machine.machine_id ||
                          `Equipment ${index + 1}`}
                      </p>
                      {imageUrl && (
                        <img
                          src={getPdfImageSrc(imageUrl)}
                          alt={`${machine.name || machine.machine_id || "Equipment"} image`}
                          className="pdf-equipment-image w-full h-32 object-contain rounded-md border border-border"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {maintenanceData.property_id && (
              <div className="mb-4">
                <span className="font-medium text-muted-foreground">
                  Property ID:
                </span>
                <p className="text-muted-foreground mt-1">
                  {maintenanceData.property_id}
                </p>
              </div>
            )}

            {assignedUserInfo && (
              <div className="mb-4">
                <span className="font-medium text-muted-foreground">
                  Assigned To:
                </span>
                <p className="text-muted-foreground mt-1">
                  {assignedUserInfo.display}
                  {assignedUserInfo.email && ` (${assignedUserInfo.email})`}
                </p>
              </div>
            )}

            {maintenanceData.completed_date && (
              <div className="mt-4 pt-4 border-t border-border">
                <span className="font-medium text-green-600">
                  Completed on: {formatDate(maintenanceData.completed_date)}
                </span>
              </div>
            )}

            {(beforeImageUrl || afterImageUrl) && (
              <div className="mt-4 pt-3 border-t border-border">
                <h3 className="font-medium text-muted-foreground mb-3 flex items-center">
                  <Camera className="h-4 w-4 mr-2" />
                  Maintenance Images
                </h3>
                <div className="pdf-image-grid grid grid-cols-2 gap-3">
                  {beforeImageUrl && (
                    <div>
                      <span className="text-sm font-medium text-muted-foreground block mb-2">
                        Before:
                      </span>
                      <img
                        src={getPdfImageSrc(beforeImageUrl)}
                        alt="Before maintenance"
                        className="pdf-maintenance-image w-full h-40 object-contain rounded-lg border border-border"
                      />
                      <div className="hidden w-full h-48 bg-muted rounded-lg border border-border flex items-center justify-center">
                        <span className="text-muted-foreground text-sm">
                          Before image unavailable
                        </span>
                      </div>
                    </div>
                  )}
                  {afterImageUrl && (
                    <div>
                      <span className="text-sm font-medium text-muted-foreground block mb-2">
                        After:
                      </span>
                      <img
                        src={getPdfImageSrc(afterImageUrl)}
                        alt="After maintenance"
                        className="pdf-maintenance-image w-full h-40 object-contain rounded-lg border border-border"
                      />
                      <div className="hidden w-full h-48 bg-muted rounded-lg border border-border flex items-center justify-center">
                        <span className="text-muted-foreground text-sm">
                          After image unavailable
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-4 border-t-2 border-border text-center">
            <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
              <div className="text-left">
                <p>
                  <strong>Report Generated:</strong>
                </p>
                <p>{formatCurrentDate()}</p>
              </div>
              <div className="text-center">
                <p>
                  <strong>Maintenance ID:</strong>
                </p>
                <p className="font-mono">{maintenanceData.pm_id}</p>
              </div>
              <div className="text-right">
                <p>
                  <strong>Page:</strong>
                </p>
                <p>1 of 1</p>
              </div>
            </div>
            <div className="mt-4 text-center text-muted-foreground">
              <p className="text-sm">
                This report was automatically generated by the Facility
                Management System
              </p>
              <p className="text-xs mt-1">
                © 2025 - Confidential and Proprietary Information
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Image modal */}
      {isImageModalOpen && currentImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
          onClick={closeImageModal}
          role="dialog"
          aria-modal="true"
          aria-label={currentImageAlt || "Maintenance image preview"}
        >
          <div className="relative max-w-4xl max-h-screen w-full h-full flex items-center justify-center">
            <button
              ref={imageModalCloseRef}
              className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              onClick={(e) => {
                e.stopPropagation();
                closeImageModal();
              }}
              aria-label="Close image preview"
            >
              <X className="h-5 w-5" />
            </button>
            <div onClick={(e) => e.stopPropagation()}>
              <MaintenanceImage
                src={currentImage}
                alt={currentImageAlt}
                className="max-w-full max-h-full object-contain"
                width={800}
                height={600}
              />
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        #pdf-content .a4-page {
          width: 210mm;
          min-height: 297mm;
          padding: 12mm;
          box-sizing: border-box;
          color: #111827;
        }

        #pdf-content .maintenance-item {
          page-break-inside: avoid;
        }

        #pdf-content .pdf-image-grid {
          align-items: start;
        }

        #pdf-content .pdf-image-card {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        #pdf-content .pdf-equipment-image,
        #pdf-content .pdf-maintenance-image {
          background: #ffffff;
          display: block;
        }

        @media print {
          .no-print {
            display: none !important;
          }
          #pdf-content {
            display: block !important;
          }
          body {
            margin: 0;
            padding: 0;
            background: white;
          }

          /* A4 Paper Styling */
          .a4-page {
            width: 210mm !important;
            min-height: 297mm !important;
            padding: 12mm !important;
            margin: 0 auto !important;
            background: white !important;
            box-shadow: none !important;
            border: none !important;
            page-break-after: always;
          }

          /* Typography for print */
          h1 {
            font-size: 24pt !important;
          }
          h2 {
            font-size: 18pt !important;
          }
          h3 {
            font-size: 14pt !important;
          }
          p {
            font-size: 10pt !important;
            line-height: 1.4 !important;
          }
          .text-sm {
            font-size: 9pt !important;
          }
          .text-xs {
            font-size: 8pt !important;
          }

          /* Images for print */
          img {
            max-height: 120mm !important;
            max-width: 80mm !important;
            page-break-inside: avoid;
            display: block !important;
            -webkit-print-color-adjust: exact;
            color-adjust: exact;
            border: 1px solid #ccc !important;
          }

          /* Grid layout for print */
          .grid {
            display: block !important;
          }
          .grid-cols-2 > * {
            display: block !important;
            margin-bottom: 10mm !important;
            page-break-inside: avoid;
          }

          /* Borders and spacing for print */
          .border,
          .border-2 {
            border: 1px solid #000 !important;
          }
          .rounded-lg,
          .rounded-xl,
          .rounded-xl {
            border-radius: 0 !important;
          }
          .shadow-card,
          .shadow-card {
            box-shadow: none !important;
          }

          /* Background colors for print */
          .bg-muted,
          .bg-blue-100,
          .bg-green-100,
          .bg-purple-100,
          .bg-indigo-100,
          .bg-orange-100,
          .bg-amber-100 {
            background: white !important;
            border: 1px solid #000 !important;
          }

          /* Status colors for print */
          .bg-green-100 {
            background: #f0f9ff !important;
          }
          .bg-red-100 {
            background: #fef2f2 !important;
          }
          .bg-yellow-100 {
            background: #fffbeb !important;
          }

          /* Page breaks */
          .maintenance-item,
          .a4-page > div {
            page-break-inside: avoid;
          }

          /* Hide screen-only elements */
          .hidden {
            display: none !important;
          }
        }

        @media screen {
          #pdf-content {
            display: none;
          }
        }

        /* A4 Page styling for screen preview */
        .a4-page {
          background: white;
          box-shadow:
            0 4px 6px -1px rgba(0, 0, 0, 0.1),
            0 2px 4px -1px rgba(0, 0, 0, 0.06);
          border: 1px solid #e5e7eb;
        }

        /* Ensure images load properly */
        #pdf-content img {
          background: white;
        }
      `}</style>
    </>
  );
}
