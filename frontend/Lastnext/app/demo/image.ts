export async function compressDemoImage(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to prepare image");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Unable to compress image")), "image/jpeg", 0.82);
    });
    return new File([blob], "demo-evidence.jpg", { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

export function validateDemoImage(file: File | null, language: "th" | "en" = "th") {
  if (!file) return language === "th" ? "กรุณาเพิ่มรูปก่อนซ่อมอย่างน้อย 1 รูป" : "Please add at least one before photo";
  if (!file.type.startsWith("image/")) return language === "th" ? "รองรับเฉพาะไฟล์รูปภาพ" : "Only image files are supported";
  if (file.size > 20 * 1024 * 1024) return language === "th" ? "รูปต้นฉบับต้องมีขนาดไม่เกิน 20 MB" : "The original image must not exceed 20 MB";
  return "";
}
