import { ImageResponse } from 'next/og';

export const size = {
  width: 512,
  height: 512,
};

export const contentType = 'image/png';

export default function Icon() {
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
          borderRadius: '104px',
          position: 'relative',
          color: '#ffffff',
          fontSize: 160,
          fontWeight: 700,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 300,
            height: 300,
            borderRadius: '50%',
            border: '24px solid #38bdf8',
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
