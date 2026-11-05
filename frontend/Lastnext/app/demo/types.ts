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
  property: { property_id: string; name: string };
  rooms: string[];
  areas: string[];
  categories: string[];
  jobs: DemoJob[];
  inventory: DemoInventory[];
  maintenance: DemoMaintenance[];
  reset_interval_minutes: number;
};

export const statusLabels: Record<DemoStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  waiting_sparepart: "Waiting Spare Part",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function categoryLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("air-condition")) return "เครื่องปรับอากาศ";
  if (normalized.includes("barth") || normalized.includes("bath")) return "ห้องน้ำ";
  if (normalized.includes("door")) return "ประตู";
  if (normalized.includes("internet")) return "อินเทอร์เน็ต / ทีวี";
  if (normalized.includes("ligth") || normalized.includes("light")) return "แสงสว่าง";
  if (normalized.includes("wall") || normalized.includes("paint")) return "ผนัง / งานสี";
  if (normalized.includes("water leask")) return "น้ำรั่ว";
  if (normalized.includes("hot water")) return "น้ำร้อน / น้ำเย็น";
  if (normalized.startsWith("pm")) return "Preventive Maintenance";
  if (normalized.includes("orther") || normalized.includes("other")) return "อาการอื่นๆ";
  return value;
}

export function displayDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

export function floorOf(room: string) {
  const digits = room.match(/\d+/)?.[0];
  if (!digits) return "Other";
  if (digits.length === 4 && digits.startsWith("1")) return digits[1];
  return digits.length >= 3 ? digits[0] : "Other";
}
