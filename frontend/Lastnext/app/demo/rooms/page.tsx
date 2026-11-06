import type { Metadata } from "next";
import { Suspense } from "react";
import DemoRoomsClient from "./DemoRoomsClient";

export const metadata: Metadata = { title: "Demo Room History | StayMaint", robots: { index: false, follow: false } };
export default function DemoRoomsPage() {
  return <Suspense fallback={<p>Loading room history…</p>}><DemoRoomsClient /></Suspense>;
}
