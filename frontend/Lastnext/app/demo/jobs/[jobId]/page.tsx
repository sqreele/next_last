import type { Metadata } from "next";
import DemoJobDetailClient from "./DemoJobDetailClient";
export const metadata: Metadata = { title: "Demo Job Detail | StayMaint", robots: { index: false, follow: false } };
export default function DemoJobDetailPage() { return <DemoJobDetailClient />; }
