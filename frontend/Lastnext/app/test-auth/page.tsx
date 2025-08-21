// app/test-auth/page.tsx
'use client';

import { useState } from 'react';
import { API_CONFIG } from '@/app/lib/config';

export default function TestAuthPage() {
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const testAuth = async () => {
    setLoading(true);
    setResult('Testing...');
    
    try {
      console.log('🔍 Testing authentication with config:', {
        baseUrl: API_CONFIG.baseUrl,
        tokenEndpoint: API_CONFIG.endpoints.token,
        fullUrl: `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.token}`
      });

      const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'sqreele1234' }),
      });

      console.log('🔍 Response status:', response.status);
      console.log('🔍 Response headers:', Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        const data = await response.json();
        setResult(`✅ Success! Token received: ${data.access ? 'Yes' : 'No'}`);
        console.log('🔍 Auth successful:', data);
      } else {
        const errorText = await response.text();
        setResult(`❌ Error ${response.status}: ${errorText}`);
        console.error('🔍 Auth failed:', errorText);
      }
    } catch (error) {
      setResult(`❌ Exception: ${error instanceof Error ? error.message : String(error)}`);
      console.error('🔍 Auth exception:', error);
    } finally {
      setLoading(false);
    }
  };

  const testHealth = async () => {
    setLoading(true);
    setResult('Testing health...');
    
    try {
      const response = await fetch(`${API_CONFIG.baseUrl}/api/v1/health/`);
      const data = await response.text();
      setResult(`✅ Health check: ${data}`);
    } catch (error) {
      setResult(`❌ Health check failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Authentication Test Page</h1>
      
      <div className="space-y-4">
        <div className="p-4 bg-gray-100 rounded">
          <h2 className="font-semibold mb-2">Current Configuration:</h2>
          <pre className="text-sm">
            {JSON.stringify({
              baseUrl: API_CONFIG.baseUrl,
              tokenEndpoint: API_CONFIG.endpoints.token,
              fullUrl: `${API_CONFIG.baseUrl}${API_CONFIG.endpoints.token}`,
              nodeEnv: process.env.NODE_ENV,
              isClient: typeof window !== 'undefined'
            }, null, 2)}
          </pre>
        </div>

        <div className="space-x-4">
          <button
            onClick={testHealth}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
          >
            Test Health Endpoint
          </button>
          
          <button
            onClick={testAuth}
            disabled={loading}
            className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
          >
            Test Authentication
          </button>
        </div>

        <div className="p-4 bg-white border rounded">
          <h3 className="font-semibold mb-2">Result:</h3>
          <pre className="whitespace-pre-wrap text-sm">{result}</pre>
        </div>
      </div>
    </div>
  );
}
