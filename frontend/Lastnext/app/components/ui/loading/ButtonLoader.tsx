import { BouncingDotsLoader } from '../BouncingDotsLoader';

export function ButtonLoader({ text = 'Loading...' }: { text?: string }) {
  return (
    <>
      <BouncingDotsLoader size="sm" className="mr-2" />
      <span>{text}</span>
    </>
  );
}
