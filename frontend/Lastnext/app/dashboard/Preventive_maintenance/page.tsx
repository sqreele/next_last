import { redirect } from 'next/navigation';

export default function LegacyPreventiveMaintenanceRedirect() {
  redirect('/dashboard/preventive-maintenance');
}
