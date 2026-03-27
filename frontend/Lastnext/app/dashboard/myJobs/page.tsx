import { redirect } from 'next/navigation';

export default function LegacyMyJobsRedirect() {
  redirect('/dashboard/my-jobs');
}
