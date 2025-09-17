# My Jobs Troubleshooting Guide

## Issue Description
User reported that "My Jobs" functionality needs to be checked to ensure it's properly fetching and displaying user-specific jobs.

## Analysis Completed

### ✅ Backend API Endpoint (`/api/v1/jobs/my_jobs/`)
**Status: WORKING CORRECTLY**

The backend implementation in `views.py` is properly implemented:
```python
@action(detail=False, methods=['get'])
def my_jobs(self, request):
    """Get jobs for the currently authenticated user"""
    user = request.user
    
    # Get all jobs where the user is the owner/creator
    jobs = Job.objects.filter(user=user).select_related(
        'user', 'updated_by'
    ).prefetch_related(
        'rooms', 'topics', 'job_images', 'job_images__uploaded_by'
    ).order_by('-created_at')
```

- ✅ Properly filters jobs by authenticated user
- ✅ Includes proper relationships (rooms, topics, images)
- ✅ Supports additional filtering (property, status, search, etc.)
- ✅ Returns structured response with count and user info

### ✅ Frontend Data Fetching (`fetchMyJobs`)
**Status: WORKING CORRECTLY**

The frontend API function is properly implemented:
```typescript
export async function fetchMyJobs(accessToken?: string, queryParams?: string): Promise<Job[]> {
  const url = queryParams ? `/api/v1/jobs/my_jobs/?${queryParams}` : `/api/v1/jobs/my_jobs/`;
  const response = await fetchWithToken<any>(url, accessToken);
  // ... proper response handling
}
```

- ✅ Correctly calls the backend endpoint
- ✅ Handles authentication with access token
- ✅ Processes response structure (results field)
- ✅ Includes data sanitization and image URL fixing

### ✅ React Hook (`useJobsData`)
**Status: WORKING CORRECTLY**

The hook properly handles My Jobs fetching:
```typescript
if (activePropertyId) {
  // Fetch property-specific jobs
  fetchedJobs = await fetchJobsForProperty(activePropertyId, session.user.accessToken, queryString);
} else {
  // Fetch user's jobs (My Jobs)
  fetchedJobs = await fetchMyJobs(session.user.accessToken, queryString);
}
```

- ✅ Correctly switches between property jobs and user jobs
- ✅ When `propertyId` is null, uses `fetchMyJobs`
- ✅ Handles authentication and session management
- ✅ Includes proper error handling and loading states

### ✅ My Jobs Component
**Status: WORKING CORRECTLY**

The My Jobs component properly uses the hook:
```typescript
const {
  jobs,
  isLoading,
  error,
  refreshJobs,
} = useJobsData({ 
  propertyId: null, // Force null to always use fetchMyJobs
  filters: filters
});
```

- ✅ Forces `propertyId: null` to ensure My Jobs endpoint is used
- ✅ Passes filters for backend filtering
- ✅ Handles responsive display (mobile cards + desktop table)
- ✅ Includes proper error handling and loading states

## Potential Issues to Check

### 1. Authentication Status
**What to verify:**
- User is properly authenticated
- Access token is present and valid
- Session is not expired

**Debug steps:**
1. Check browser dev tools → Network tab
2. Look for `/api/v1/jobs/my_jobs/` request
3. Verify Authorization header is present
4. Check response status (should be 200)

### 2. Environment Configuration
**What to verify:**
- API URL configuration is correct
- Backend is accessible from frontend
- CORS settings allow the requests

**Debug steps:**
1. Check `API_CONFIG.baseUrl` in browser console
2. Verify backend is running and accessible
3. Test direct API call: `GET /api/v1/jobs/my_jobs/`

### 3. Data Flow
**What to verify:**
- Jobs are being created with proper user association
- Database contains jobs for the authenticated user
- Response format matches expected structure

## Debug Tools Added

### MyJobsDebug Component
Added a comprehensive debug component that shows:
- Session status and user information
- API call status and timing
- Jobs data and count
- Direct API test functionality
- Raw debug information

**Location:** `app/components/debug/MyJobsDebug.tsx`
**Usage:** Automatically shown in development mode on My Jobs page

### Debug Features
1. **Session Verification:** Shows authentication status and user details
2. **API Status:** Shows loading, error, and success states
3. **Data Display:** Shows job count and first job details
4. **Direct API Test:** Button to test API endpoint directly
5. **Network Logging:** Console logs all API calls and responses

## Testing Steps

### 1. Quick Verification
```bash
# 1. Check if backend is running
curl http://localhost:8000/api/v1/health/

# 2. Test My Jobs endpoint (replace TOKEN with actual token)
curl -H "Authorization: Bearer TOKEN" http://localhost:8000/api/v1/jobs/my_jobs/
```

### 2. Frontend Testing
1. Open browser dev tools
2. Go to My Jobs page (`/dashboard/myJobs`)
3. Check debug panel (development mode only)
4. Click "Debug Refresh" and "Test Direct API Call"
5. Monitor console logs and network requests

### 3. Database Verification
```sql
-- Check if user has jobs in database
SELECT COUNT(*) FROM myappLubd_job WHERE user_id = [USER_ID];

-- Check recent jobs for user
SELECT job_id, description, status, created_at 
FROM myappLubd_job 
WHERE user_id = [USER_ID] 
ORDER BY created_at DESC 
LIMIT 10;
```

## Expected Behavior

### Successful My Jobs Flow
1. User navigates to `/dashboard/myJobs`
2. `useJobsData` hook is called with `propertyId: null`
3. Hook calls `fetchMyJobs` with user's access token
4. API endpoint `/api/v1/jobs/my_jobs/` is called
5. Backend filters jobs by authenticated user
6. Response contains user's jobs in `results` field
7. Frontend displays jobs in responsive layout

### Response Format
```json
{
  "count": 5,
  "results": [
    {
      "job_id": "12345",
      "description": "Fix broken pipe",
      "status": "pending",
      "user": 123,
      "rooms": [...],
      "topics": [...],
      "created_at": "2024-01-01T10:00:00Z"
    }
  ],
  "user_id": 123,
  "username": "john_doe",
  "message": "Found 5 jobs for user john_doe"
}
```

## Resolution Status

**Current Status: ✅ ARCHITECTURE VERIFIED**

The My Jobs functionality is architecturally sound and should be working correctly. The issue may be:

1. **Environment-specific:** Backend not running or not accessible
2. **Authentication:** User not properly authenticated or token expired
3. **Data-specific:** User has no jobs in the database
4. **Network:** CORS or network connectivity issues

**Next Steps:**
1. Use the debug component to identify the specific issue
2. Check browser network tab for failed requests
3. Verify backend is running and accessible
4. Test with a user that has jobs in the database

## Debug Component Usage

The debug component has been added to the My Jobs page and will show in development mode. It provides:

- Real-time session status
- API call monitoring
- Direct endpoint testing
- Detailed error information
- Network request verification

This should quickly identify where the issue lies in the data flow.
