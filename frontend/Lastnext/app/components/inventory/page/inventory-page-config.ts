"use client";

import React from "react";

export interface InventoryItem {
  id: number;
  item_id: string;
  name: string;
  description?: string;
  category: string;
  category_display?: string;
  quantity: number;
  min_quantity: number;
  max_quantity?: number;
  unit: string;
  unit_price?: number;
  location?: string;
  supplier?: string;
  supplier_contact?: string;
  status: string;
  status_display?: string;
  property_id?: string;
  property_name?: string;
  room_id?: string;
  room_name?: string;
  job_id?: string;
  job_description?: string;
  pm_id?: string;
  pm_title?: string;
  last_job_by_user?: {
    job_id: string;
    description: string;
    full_description: string;
  } | null;
  last_pm_by_user?: {
    pm_id: string;
    title: string;
    full_title: string;
  } | null;
  image_url?: string;
  last_restocked?: string;
  expiry_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export const STATUS_COLORS: Record<string, string> = {
  available: "border-success/30 bg-success/10 text-success",
  low_stock: "border-warning/30 bg-warning/10 text-warning-emphasis",
  out_of_stock: "border-destructive/30 bg-destructive/10 text-destructive",
  reserved: "border-info/30 bg-info/10 text-info",
  maintenance: "border-border bg-muted text-foreground",
};

export const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  tools: "🔧",
  parts: "⚙️",
  supplies: "📦",
  equipment: "🛠️",
  consumables: "🧴",
  safety: "🦺",
  safety_equipment: "🦺",
  other: "📋",
};
