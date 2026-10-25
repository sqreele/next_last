import type { Metadata } from "next";
import { FloorPlanView } from "./FloorPlanView";

export const metadata: Metadata = {
  title: "Floor Plan",
  description: "Browse rooms and operational areas on the active property's floor plan.",
};

export default function FloorPlanPage() {
  return <FloorPlanView />;
}

