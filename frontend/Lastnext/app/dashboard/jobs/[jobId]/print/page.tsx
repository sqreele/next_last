import { notFound } from 'next/navigation';
import { fetchJob, fetchProperties } from '@/app/lib/data.server';
import type { Metadata } from 'next';
import { PrintableWorkOrder } from './PrintableWorkOrder';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ jobId: string }>;
};

export const metadata: Metadata = {
  title: 'Work order',
  robots: { index: false, follow: false },
};

export default async function PrintWorkOrderPage({ params }: Props) {
  const { jobId } = await params;
  const job = await fetchJob(jobId);
  if (!job) notFound();
  const properties = await fetchProperties();

  return <PrintableWorkOrder job={job} properties={properties} />;
}
