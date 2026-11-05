import type { Metadata } from "next";
import DemoJobsClient from "./DemoJobsClient";
export const metadata: Metadata = { title: "Demo Jobs | StayMaint", robots: { index: false, follow: false } };
export default function DemoJobsPage() { return <DemoJobsClient />; }
