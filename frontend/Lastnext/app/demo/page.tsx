import type { Metadata } from "next";

import DemoDashboardClient from "./DemoDashboardClient";

export const metadata: Metadata = {
  title: "Live Demo",
  description: "Try the StayMaint hotel maintenance workflow with safe sample data.",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <DemoDashboardClient />;
}
