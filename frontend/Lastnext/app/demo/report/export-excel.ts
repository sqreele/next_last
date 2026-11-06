import type { Workbook } from "exceljs";

export type ReportImage = { image_type: "before" | "after"; image_url: string };

export function imageLinks(images: ReportImage[] = [], type: ReportImage["image_type"], origin: string) {
  return images.filter((image) => image.image_type === type).map((image) => {
    const url = new URL(image.image_url, origin);
    return url.origin === origin && ["http:", "https:"].includes(url.protocol) ? url.href : "";
  }).filter(Boolean);
}

async function thumbnail(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Image unavailable");
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const image = new window.Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 100;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image conversion unavailable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 160, 100);
    const scale = Math.min(160 / image.naturalWidth, 100 / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (160 - width) / 2, (100 - height) / 2, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function exportDemoExcel(headers: string[], rows: string[][], images: ReportImage[][], filename: string) {
  const ExcelJS = await import("exceljs");
  const workbook: Workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Jobs");
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  sheet.columns.forEach((column, index) => { column.width = index === 1 ? 45 : 25; });
  let failedImages = 0;
  for (const [index, values] of rows.entries()) {
    const row = sheet.addRow(values);
    row.alignment = { vertical: "top", wrapText: true };
    const evidence: Array<{ url: string; column: number }> = [];
    for (const [offset, type] of (["before", "after"] as const).entries()) {
      const urls = imageLinks(images[index], type, window.location.origin);
      const linkCell = row.getCell(9 + offset);
      if (urls.length) {
        linkCell.value = { text: urls.join("\n"), hyperlink: urls[0] };
        linkCell.font = { color: { argb: "FF2563EB" }, underline: true };
      }
      // Stack each type's photos vertically inside the job's worksheet row.
      urls.forEach((url) => evidence.push({ url, column: 10 + offset }));
    }
    const before = evidence.filter((item) => item.column === 10);
    const after = evidence.filter((item) => item.column === 11);
    row.height = Math.max(1, before.length, after.length) * 80;
    for (const group of [before, after]) {
      for (const [imageIndex, item] of group.entries()) {
        try {
          const base64 = await thumbnail(item.url);
          const imageId = workbook.addImage({ base64, extension: "png" });
          sheet.addImage(imageId, { tl: { col: item.column, row: row.number - 1 + imageIndex * 80 / row.height }, ext: { width: 160, height: 100 }, editAs: "oneCell" });
        } catch {
          failedImages += 1;
        }
      }
    }
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
  return failedImages;
}
