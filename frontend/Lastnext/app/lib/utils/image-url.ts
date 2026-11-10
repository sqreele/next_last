/** Compatibility helper: Next Image owns transformations; source URLs stay intact. */
export function generateOptimizedImageUrl(
  src: string,
  _width: number,
  _height: number,
  _quality: number = 75,
  _format: 'avif' | 'jpeg' = 'jpeg',
): string {
  return src;
}
