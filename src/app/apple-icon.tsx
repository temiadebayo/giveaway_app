import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// Image metadata
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
                    fontSize: 120,
                    background: 'linear-gradient(135deg, #9506FA 0%, #5708EF 50%, #00D4FF 100%)',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    borderRadius: '40px',
                    fontWeight: 900,
                    fontFamily: 'sans-serif'
                }}
            >
                G
            </div>
        ),
        {
            ...size,
        }
    );
}
