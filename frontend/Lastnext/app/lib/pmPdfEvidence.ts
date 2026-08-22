import type { MaintenanceImage } from "./preventiveMaintenanceModels";

export const PM_PDF_EVIDENCE_LIMIT = 10;

export interface PMPdfEvidenceItem {
  key: string;
  imageUrl: string;
  imageType: "before" | "after";
  label: string;
}

export interface PMPdfEvidenceSelection {
  items: PMPdfEvidenceItem[];
  total: number;
  truncated: boolean;
}

type PMPdfEvidenceSourceImage = Omit<MaintenanceImage, "image_url"> & {
  image_url?: string | null;
};

export function selectPMPdfEvidence(
  images: PMPdfEvidenceSourceImage[],
  reportedTotal?: number,
): PMPdfEvidenceSelection {
  const validImages = images.filter(
    (image): image is PMPdfEvidenceSourceImage & {
      image_type: "before" | "after";
      image_url: string;
    } =>
      (image.image_type === "before" || image.image_type === "after") &&
      Boolean(image.image_url),
  );
  const orderedImages = [
    ...validImages.filter((image) => image.image_type === "before"),
    ...validImages.filter((image) => image.image_type === "after"),
  ];
  const typeCounts = { before: 0, after: 0 };
  const items = orderedImages.slice(0, PM_PDF_EVIDENCE_LIMIT).map((image, index) => {
    typeCounts[image.image_type] += 1;
    return {
      key: `${image.image_type}-${String(image.id ?? index)}`,
      imageUrl: image.image_url,
      imageType: image.image_type,
      label: `${image.image_type === "before" ? "Before" : "After"} ${typeCounts[image.image_type]}`,
    };
  });
  const total = Math.max(orderedImages.length, reportedTotal ?? 0);

  return {
    items,
    total,
    truncated: total > items.length,
  };
}
