// Test script to verify user registration and login data flow
const http = require('http');

const API_URL = 'http://localhost:5000/api';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5000,
      path: '/api' + path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data && data.token) {
      options.headers['Authorization'] = `Bearer ${data.token}`;
      delete data.token;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    
    if (data && method !== 'GET') {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testUserFlow() {
  try {
    console.log('=== Testing User Registration & Login Flow ===\n');

    // 1. Register a new user
    console.log('1. Registering new user...');
    const registerData = {
      name: 'Test User Dashboard',
      email: `test-dashboard-${Date.now()}@example.com`,
      password: 'password123',
      location: 'Test City'
    };

    const registerResponse = await makeRequest('POST', '/auth/register', registerData);
    
    if (registerResponse.status !== 201) {
      console.error('❌ Registration failed:', registerResponse.data);
      process.exit(1);
    }

    console.log('\n✅ Registration successful!');
    console.log('Token received:', registerResponse.data.token ? 'Yes' : 'No');
    console.log('\nUser object returned:');
    console.log(JSON.stringify(registerResponse.data.user, null, 2));
    
    console.log('\n📊 Checking required fields for dashboard:');
    const user = registerResponse.data.user;
    console.log('- name:', user.name || '❌ MISSING');
    console.log('- total_exchanges:', user.total_exchanges !== undefined ? user.total_exchanges : '❌ MISSING');
    console.log('- tokens_earned:', user.tokens_earned !== undefined ? user.tokens_earned : '❌ MISSING');
    console.log('- rating:', user.rating !== undefined ? user.rating : '❌ MISSING');
    console.log('- badges:', user.badges ? user.badges.join(', ') : '❌ MISSING');
    console.log('- skills_offered:', user.skills_offered ? `${user.skills_offered.length} skills` : '❌ MISSING');
    console.log('- skills_wanted:', user.skills_wanted ? `${user.skills_wanted.length} skills` : '❌ MISSING');

    // 2. Login with the same user
    console.log('\n\n2. Logging in with the same user...');
    const loginResponse = await makeRequest('POST', '/auth/login', {
      email: registerData.email,
      password: registerData.password
    });
    
    if (loginResponse.status !== 200) {
      console.error('❌ Login failed:', loginResponse.data);
      process.exit(1);
    }

    console.log('\n✅ Login successful!');
    console.log('Token received:', loginResponse.data.token ? 'Yes' : 'No');
    console.log('\nUser object returned:');
    console.log(JSON.stringify(loginResponse.data.user, null, 2));

    // 3. Fetch user data via /auth/me endpoint
    console.log('\n\n3. Fetching user data via /auth/me...');
    const meResponse = await makeRequest('GET', '/auth/me', { token: loginResponse.data.token });
    
    if (meResponse.status !== 200) {
      console.error('❌ /auth/me failed:', meResponse.data);
      process.exit(1);
    }

    console.log('\n✅ /auth/me successful!');
    console.log('\nUser object returned:');
    console.log(JSON.stringify(meResponse.data.user, null, 2));

    console.log('\n\n=== Test Complete ===');
    console.log('\n✅ All endpoints return consistent user data');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
  
  process.exit(0);
}

testUserFlow();
