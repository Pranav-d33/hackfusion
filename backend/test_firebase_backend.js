const { execSync } = require('child_process');
async function test() {
  const registerRes = await fetch('http://localhost:8000/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'User', email: 'userxyz123@example.com', password: 'password123', phone: '123' })
  });
  console.log("Register Route:", await registerRes.json());
}
test().catch(console.error);
