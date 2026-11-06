export type DemoStatus = "pending" | "in_progress" | "waiting_sparepart" | "completed" | "cancelled";
export type DemoPriority = "low" | "medium" | "high" | "critical";

export type DemoImage = {
  id: number | string;
  image_type: "before" | "after";
  image_url: string;
};

export type DemoComment = {
  id: number;
  author: string;
  comment: string;
  created: string;
};

export type DemoJob = {
  machine?: DemoMachine | null;
  documents?: Array<{ id: number; name: string; size: number; url: string }>;
  id: string;
  title: string;
  room: string;
  technician: string;
  status: DemoStatus;
  priority: DemoPriority;
  category: string;
  updated: string;
  created: string;
  completed: string | null;
  remarks: string;
  is_defective: boolean;
  is_preventive_maintenance: boolean;
  images: DemoImage[];
  comments: DemoComment[];
};

export type DemoInventory = { item_id: string; name: string; quantity: number; status: string };
export type DemoMaintenance = { pm_id: string; pmtitle: string; status: string; scheduled_date: string; quality_score: number | null };

export type DemoSnapshot = {
  machines?: DemoMachine[];
  property: { property_id: string; name: string };
  rooms: string[];
  areas: string[];
  categories: string[];
  jobs: DemoJob[];
  inventory: DemoInventory[];
  maintenance: DemoMaintenance[];
  reset_interval_minutes: number;
};

export type DemoMachine = {
  machine_id: string; name: string; brand: string | null; serial_number: string | null;
  category: string | null; location: string | null; status: string; description: string | null;
  asset_tag: string | null; installation_date: string | null;
  last_maintenance_date: string | null; warranty_end_date: string | null;
};

export const statusLabels: Record<DemoStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  waiting_sparepart: "Waiting Spare Part",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const statusLabelsThai: Record<DemoStatus, string> = {
  pending: "รอดำเนินการ",
  in_progress: "กำลังดำเนินการ",
  waiting_sparepart: "รออะไหล่",
  completed: "เสร็จแล้ว",
  cancelled: "ยกเลิก",
};

export function categoryLabel(value: string, language: "th" | "en" = "th") {
  const normalized = value.toLowerCase();
  if (normalized === "pmms rooms") return language === "th" ? "PMM ห้องพัก" : "PMMs Rooms";
  if (normalized.includes("air-condition")) return language === "th" ? "เครื่องปรับอากาศ" : "Air Conditioning";
  if (normalized.includes("barth") || normalized.includes("bath")) return language === "th" ? "ห้องน้ำ" : "Bathroom";
  if (normalized.includes("door")) return language === "th" ? "ประตู" : "Door";
  if (normalized.includes("internet")) return language === "th" ? "อินเทอร์เน็ต / ทีวี" : "Internet / TV";
  if (normalized.includes("ligth") || normalized.includes("light")) return language === "th" ? "แสงสว่าง" : "Lighting";
  if (normalized.includes("wall") || normalized.includes("paint")) return language === "th" ? "ผนัง / งานสี" : "Wall / Painting";
  if (normalized.includes("water leask")) return language === "th" ? "น้ำรั่ว" : "Water Leak";
  if (normalized.includes("hot water")) return language === "th" ? "น้ำร้อน / น้ำเย็น" : "Hot / Cold Water";
  if (normalized.startsWith("pm")) return "Preventive Maintenance";
  if (normalized.includes("orther") || normalized.includes("other")) return language === "th" ? "อาการอื่นๆ" : "Other";
  return value;
}

export function displayDate(value: string | null, language: "th" | "en" = "th") {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(language === "th" ? "th-TH" : "en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function floorOf(room: string) {
  const digits = room.match(/\d+/)?.[0];
  if (!digits) return "Other";
  if (digits.length === 4 && digits.startsWith("1")) return digits[1];
  return digits.length >= 3 ? digits[0] : "Other";
}
