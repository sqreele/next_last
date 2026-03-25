import { ImageResponse } from 'next/og';

export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1e40af',
          borderRadius: '36px',
          position: 'relative',
          color: '#ffffff',
          fontSize: 58,
          fontWeight: 700,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 102,
            height: 102,
            borderRadius: '50%',
            border: '8px solid #38bdf8',
          }}
        />
        HE
      </div>
    ),
    {
      ...size,
    }
  );
}
