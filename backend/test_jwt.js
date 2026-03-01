const { execSync } = require('child_process');
async function test() {
  const loginRes = await fetch('http://localhost:8000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test User', email: 'test57@example.com', password: 'password123' })
  });
  const data = await loginRes.json();
  console.log("Token received:", data.session_token ? data.session_token.substring(0, 20) + '...' : 'none');
  console.log("Is JWT format (ey...)?", data.session_token && data.session_token.startsWith('eyJ'));

  if(data.session_token) {
    const meRes = await fetch('http://localhost:8000/api/auth/me', {
      headers: { 'Authorization': `Bearer ${data.session_token}` }
    });
    console.log("GET /me response status:", meRes.status);
    const meData = await meRes.json();
    console.log("GET /me user ID:", meData.id);
  }
}
test().catch(console.error);
