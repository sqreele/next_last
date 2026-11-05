import type { Metadata } from "next";

import DemoClient from "./DemoClient";

export const metadata: Metadata = {
  title: "Live Demo",
  description: "Try the StayMaint hotel maintenance workflow with safe sample data.",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <DemoClient />;
}
