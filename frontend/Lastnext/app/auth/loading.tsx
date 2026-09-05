import { BouncingDotsLoader } from '@/app/components/ui/BouncingDotsLoader';

export default function AuthLoading() {
  return <BouncingDotsLoader size="lg" label="Loading secure sign-in" fullScreen />;
}
