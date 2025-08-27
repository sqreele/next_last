
export default function Login() {
  if (typeof window !== 'undefined') {
    window.location.replace('/api/auth/login');
  }
  return null;
}