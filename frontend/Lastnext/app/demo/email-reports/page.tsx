import type { Metadata } from "next";
import EmailReportsClient from "./EmailReportsClient";

export const metadata: Metadata = { title: "Demo Email Reports | StayMaint", robots: { index: false, follow: false } };
export default function EmailReportsPage() { return <EmailReportsClient />; }
