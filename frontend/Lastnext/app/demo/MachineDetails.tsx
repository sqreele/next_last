"use client";
import type { DemoMachine } from "./types";
import { useDemoLanguage } from "./DemoLanguageProvider";

export default function MachineDetails({ machine }: { machine: DemoMachine }) {
  const { text } = useDemoLanguage();
  const fields = [
    [text("รหัสเครื่อง", "Machine ID"), machine.machine_id], [text("ชื่อเครื่อง", "Machine name"), machine.name],
    [text("ยี่ห้อ", "Brand"), machine.brand], ["Serial Number", machine.serial_number],
    [text("ประเภทเครื่อง", "Equipment category"), machine.category], [text("ตำแหน่ง", "Location"), machine.location],
    [text("สถานะเครื่อง", "Equipment status"), machine.status], [text("รหัสทรัพย์สิน", "Asset tag"), machine.asset_tag],
    [text("วันที่ติดตั้ง", "Installation date"), machine.installation_date],
    [text("บำรุงรักษาล่าสุด", "Last maintenance"), machine.last_maintenance_date],
    [text("สิ้นสุดประกัน", "Warranty end"), machine.warranty_end_date],
  ];
  return <section className="rounded-xl border border-teal-100 bg-teal-50/50 p-4"><h3 className="font-semibold text-teal-900">{text("ข้อมูลเครื่องจักรที่เกี่ยวข้อง", "Related machine details")}</h3><dl className="mt-4 grid grid-cols-2 gap-4">{fields.map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium">{value || text("ยังไม่ระบุ", "Not provided")}</dd></div>)}</dl>{machine.description && <p className="mt-4 whitespace-pre-wrap text-sm text-slate-600">{machine.description}</p>}</section>;
}
