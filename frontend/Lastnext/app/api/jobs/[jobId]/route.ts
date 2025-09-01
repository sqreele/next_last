import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/app/lib/session.server';
import { API_CONFIG } from '@/app/lib/config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;

    // Fetch job from the external API
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/jobs/${jobId}/`,
      {
        headers: {
          'Authorization': `Bearer ${session.user.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('Failed to fetch job:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to fetch job' }, 
        { status: response.status }
      );
    }

    const job = await response.json();
    return NextResponse.json(job);

  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;
    const contentType = request.headers.get('content-type') || '';
    let fetchOptions: RequestInit = {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${session.user.accessToken}` } as any,
    };

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      fetchOptions.body = formData as any;
    } else {
      const body = await request.json();
      fetchOptions.headers = {
        ...(fetchOptions.headers as any),
        'Content-Type': 'application/json',
      } as any;
      fetchOptions.body = JSON.stringify(body);
    }

    // Update job in the external API
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/jobs/${jobId}/`,
      fetchOptions
    );

    if (!response.ok) {
      console.error('Failed to update job:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to update job' }, 
        { status: response.status }
      );
    }

    const job = await response.json();
    return NextResponse.json(job);

  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;
    const contentType = request.headers.get('content-type') || '';
    let fetchOptions: RequestInit = {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${session.user.accessToken}` } as any,
    };

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      fetchOptions.body = formData as any;
    } else {
      const body = await request.json();
      fetchOptions.headers = {
        ...(fetchOptions.headers as any),
        'Content-Type': 'application/json',
      } as any;
      fetchOptions.body = JSON.stringify(body);
    }

    // Update job in the external API
    const response = await fetch(
      `${API_CONFIG.baseUrl}/api/v1/jobs/${jobId}/`,
      fetchOptions
    );

    if (!response.ok) {
      console.error('Failed to update job:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to update job' }, 
        { status: response.status }
      );
    }

    const job = await response.json();
    return NextResponse.json(job);

  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    // Get session to verify authentication
    const session = await getServerSession();
    
    if (!session?.user?.accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { jobId } = await params;

    // Delete job from the external API
    const response = await fetch(
      `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.jobs}${jobId}/`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.user.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      console.error('Failed to delete job:', response.status, response.statusText);
      return NextResponse.json(
        { error: 'Failed to delete job' }, 
        { status: response.status }
      );
    }

    return NextResponse.json({ message: 'Job deleted successfully' });

  } catch (error) {
    console.error('Error deleting job:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
} 