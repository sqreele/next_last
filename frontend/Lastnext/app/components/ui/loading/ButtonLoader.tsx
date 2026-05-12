import { Spinner } from './Spinner';

export function ButtonLoader({ text = 'Loading...' }: { text?: string }) {
  return (
    <>
      <Spinner size="sm" className="mr-2" />
      <span>{text}</span>
    </>
  );
}
