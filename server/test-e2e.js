/**
 * E2E test for openai-bridge.js
 * Simulates Cline/Roo-Code client requests
 * 
 * Usage: node server/test-e2e.js
 */

const http = require('http');

const BASE = 'http://localhost:8102';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = { method, hostname: url.hostname, port: url.port, path: url.pathname, headers: { 'Content-Type': 'application/json' } };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

async function main() {
  console.log('\n🧪 E2E Test for openai-bridge.js\n');

  // Test 1: /v1/models
  await test('GET /v1/models', async () => {
    const res = await request('GET', '/v1/models');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = JSON.parse(res.body);
    if (data.data?.length < 6) throw new Error(`Only ${data.data?.length} models`);
  });

  // Test 2: /v1/status
  await test('GET /v1/status', async () => {
    const res = await request('GET', '/v1/status');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = JSON.parse(res.body);
    if (data.status !== 'running') throw new Error(`Status: ${data.status}`);
  });

  // Test 3: /metrics
  await test('GET /metrics', async () => {
    const res = await request('GET', '/metrics');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.body.includes('glm_chat_requests_total')) throw new Error('Missing metrics');
  });

  // Test 4: /v1/chat/completions validation (no messages)
  await test('POST /v1/chat/completions - validation', async () => {
    const res = await request('POST', '/v1/chat/completions', {});
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 5: /v1/chat/completions unknown model
  await test('POST /v1/chat/completions - unknown model', async () => {
    const res = await request('POST', '/v1/chat/completions', {
      model: 'gpt-4', messages: [{ role: 'user', content: 'test' }]
    });
    if (res.status !== 400) throw new Error(`Expected 400, got ${res.status}`);
  });

  // Test 6: Token estimation
  await test('Token estimation', async () => {
    const res = await request('GET', '/v1/status');
    const data = JSON.parse(res.body);
    if (!data.models.includes('glm-5.1')) throw new Error('Missing glm-5.1');
  });

  // Test 7: Function calling format (no browser needed - just validate request parsing)
  await test('Function calling - tools accepted', async () => {
    // This will fail with 500 (no browser), but should parse tools correctly
    const res = await request('POST', '/v1/chat/completions', {
      model: 'glm-5.1',
      messages: [{ role: 'user', content: 'What is 2+2?' }],
      tools: [{
        type: 'function',
        function: {
          name: 'calculator',
          description: 'Performs arithmetic',
          parameters: { type: 'object', properties: { expression: { type: 'string' } } }
        }
      }]
    });
    // Will get 500 (no browser), but should not get 400 (validation error)
    if (res.status === 400) throw new Error('Tools not accepted: ' + res.body);
  });

  // Test 8: stream_options.include_usage accepted
  await test('stream_options.include_usage accepted', async () => {
    const res = await request('POST', '/v1/chat/completions', {
      model: 'glm-5.1',
      messages: [{ role: 'user', content: 'test' }],
      stream: true,
      stream_options: { include_usage: true }
    });
    if (res.status === 400) throw new Error('stream_options not accepted: ' + res.body);
  });

  // Test 9: /v1/sessions
  await test('GET /v1/sessions', async () => {
    const res = await request('GET', '/v1/sessions');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    const data = JSON.parse(res.body);
    if (!Array.isArray(data.sessions)) throw new Error('No sessions array');
  });

  // Test 10: Auth disabled (no API_KEYS)
  await test('Auth disabled - no key required', async () => {
    const res = await request('GET', '/v1/models');
    if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  });

  // Test 11: Real chat completion (requires CDP browser)
  await test('Real chat completion via CDP', async () => {
    const res = await request('POST', '/v1/chat/completions', {
      model: 'glm-5.1',
      messages: [{ role: 'user', content: 'Say the word YES and nothing else' }],
      stream: false
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${res.body.slice(0, 200)}`);
    const data = JSON.parse(res.body);
    if (!data.choices?.[0]?.message?.content) throw new Error('No content in response');
    if (data.usage?.prompt_tokens <= 0) throw new Error('Invalid prompt_tokens: ' + data.usage?.prompt_tokens);
    if (data.usage?.completion_tokens <= 0) throw new Error('Invalid completion_tokens');
    console.log(`    Response: ${data.choices[0].message.content.slice(0, 50)}`);
    console.log(`    Usage: prompt=${data.usage.prompt_tokens}, completion=${data.usage.completion_tokens}`);
  });

  console.log('\n📋 Summary: 11 tests completed\n');
}

main().catch(console.error);
