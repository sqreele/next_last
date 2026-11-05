import type { Metadata } from "next";
import DemoJobsClient from "../jobs/DemoJobsClient";
export const metadata: Metadata = { title: "My Demo Jobs | StayMaint", robots: { index: false, follow: false } };
export default function DemoMyJobsPage() { return <DemoJobsClient mode="mine" />; }
