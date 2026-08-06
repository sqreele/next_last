import { PageLoader } from '@/app/components/ui/loading';

export default function AuthLoading() {
  return <PageLoader label="Loading secure sign-in" description="Checking your HotelCare Pro authentication session." />;
}
