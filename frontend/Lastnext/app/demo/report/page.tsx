import type { Metadata } from "next";

import DemoReportClient from "./DemoReportClient";

export const metadata: Metadata = {
  title: "Demo Report | StayMaint",
  description: "Interactive maintenance report generated from the isolated StayMaint demo database.",
  robots: { index: false, follow: false },
};

export default function DemoReportPage() {
  return <DemoReportClient />;
}
