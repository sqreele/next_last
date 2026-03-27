import { redirect } from 'next/navigation';

export default function LegacyCreateJobRedirect() {
  redirect('/dashboard/create-job');
}
