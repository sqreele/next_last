import type { Metadata } from "next";
import DemoCreateJobClient from "./DemoCreateJobClient";

export const metadata: Metadata = { title: "Create Demo Job | StayMaint", robots: { index: false, follow: false } };
export default function DemoCreateJobPage() { return <DemoCreateJobClient />; }
