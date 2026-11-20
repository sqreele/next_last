import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

// Reuse the brand's vector artwork to produce a social crawler compatible JPEG.
await sharp(fileURLToPath(new URL('../public/branding/social-card.svg', import.meta.url)))
  .jpeg({ quality: 90, mozjpeg: true })
  .toFile(fileURLToPath(new URL('../public/og-image.jpg', import.meta.url)));
