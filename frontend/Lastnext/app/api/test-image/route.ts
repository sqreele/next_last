import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const imageUrl = 'http://localhost:8000/media/maintenance_pm_images/2025/09/Screenshot_2025-08-18_233130.png';
    
    // Test if the image is accessible
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      return NextResponse.json({ 
        error: 'Image not accessible', 
        status: response.status,
        url: imageUrl 
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      url: imageUrl,
      status: response.status,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    });
    
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to fetch image', 
      message: error instanceof Error ? error.message : 'Unknown error',
      url: 'http://localhost:8000/media/maintenance_pm_images/2025/09/Screenshot_2025-08-18_233130.png'
    });
  }
}
