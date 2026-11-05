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

export function validateDemoImage(file: File | null) {
  if (!file) return "กรุณาเพิ่มรูป Before อย่างน้อย 1 รูป";
  if (!file.type.startsWith("image/")) return "รองรับเฉพาะไฟล์รูปภาพ";
  if (file.size > 20 * 1024 * 1024) return "รูปต้นฉบับต้องมีขนาดไม่เกิน 20 MB";
  return "";
}
