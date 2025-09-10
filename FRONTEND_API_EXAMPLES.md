# Frontend API Integration Examples

This document shows how the Next.js frontend integrates with the Django REST Framework backend API.

## API Configuration

The frontend uses Next.js API routes as a proxy layer between the client and the Django backend. This provides:
- Server-side authentication management
- Token handling
- CORS avoidance
- Request/response logging

## Authentication Flow

1. **User Login**: Frontend calls Next.js API route → Next.js calls Django backend
2. **Token Storage**: Access tokens are stored in server-side sessions
3. **API Requests**: All API calls include the Bearer token from the session

## Example API Calls from Frontend

### 1. Fetching Properties (Next.js API Route)
```typescript
// app/api/properties/route.ts
const apiUrl = `${API_CONFIG.baseUrl}/api/v1/properties/`;
const response = await fetch(apiUrl, {
  headers: {
    'Authorization': `Bearer ${session.user.accessToken}`,
    'Content-Type': 'application/json',
  },
});
```

### 2. Creating a Job (Using Axios)
```typescript
// app/components/jobs/CreateJobForm.tsx
import axios from 'axios';

const response = await axios.post(`/api/jobs/`, formData, { 
  withCredentials: true 
});
```

### 3. Fetching Multiple Resources
```typescript
// Parallel API calls
const [roomsRes, topicsRes] = await Promise.all([
  axios.get(`/api/rooms/`, { 
    withCredentials: true, 
    params: propertyParam ? { property: propertyParam } : undefined 
  }),
  axios.get(`/api/topics/`, { withCredentials: true })
]);
```

### 4. Completing Preventive Maintenance
```typescript
const response = await fetch(`/api/preventive-maintenance/${maintenanceData.pm_id}/complete/`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data)
});
```

## API Route Mappings

The Next.js configuration (`next.config.mjs`) sets up the following rewrites:

### Production Routes
- `/api/v1/*` → `${BACKEND_URL}/api/v1/*` (Direct proxy to Django)
- `/api/users/*` → `${BACKEND_URL}/api/v1/users/*` (User endpoints)
- `/auth/*` → Handled by Next.js (NextAuth)

### Development Routes
Same as production plus:
- `/media/*` → `${BACKEND_URL}/media/*` (Media files)

## Common Patterns

### 1. API Route Handler Pattern
```typescript
export async function GET(request: NextRequest) {
  // Get session
  const session = await getServerSession();
  
  // Check authentication
  if (!session?.user?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Make backend API call
  const response = await fetch(`${API_CONFIG.baseUrl}/api/v1/resource/`, {
    headers: {
      'Authorization': `Bearer ${session.user.accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  
  // Handle response
  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch resource' }, 
      { status: response.status }
    );
  }
  
  const data = await response.json();
  return NextResponse.json(data);
}
```

### 2. Client Component Pattern
```typescript
const fetchData = async () => {
  try {
    const response = await fetch('/api/resource');
    if (!response.ok) throw new Error('Failed to fetch');
    const data = await response.json();
    setData(data);
  } catch (error) {
    console.error('Error:', error);
  }
};
```

### 3. Form Submission Pattern
```typescript
const handleSubmit = async (formData: FormData) => {
  try {
    const response = await fetch('/api/resource', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(formData)),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) throw new Error('Failed to submit');
    const result = await response.json();
    // Handle success
  } catch (error) {
    // Handle error
  }
};
```

## Error Handling

The frontend typically handles these error scenarios:
- 401 Unauthorized: Redirect to login
- 403 Forbidden: Show permission error
- 404 Not Found: Show not found message
- 500 Server Error: Show generic error message

## File Uploads

For file uploads (e.g., preventive maintenance images):
```typescript
const formData = new FormData();
formData.append('images', file);

const response = await fetch(`/api/preventive-maintenance/${pm_id}/upload-images/`, {
  method: 'POST',
  body: formData,
  // Note: Don't set Content-Type header for FormData
});
```

## Environment Variables

The frontend uses these environment variables:
- `NEXT_PUBLIC_BACKEND_URL`: Backend API URL
- `AUTH0_DOMAIN`: Auth0 domain
- `AUTH0_CLIENT_ID`: Auth0 client ID
- `AUTH0_CLIENT_SECRET`: Auth0 client secret

## Best Practices

1. Always use Next.js API routes instead of calling Django directly from the client
2. Handle loading and error states in UI components
3. Use proper TypeScript types for API responses
4. Implement retry logic for failed requests
5. Cache data when appropriate using SWR or React Query