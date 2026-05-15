// 测试认证功能的脚本
// 在Node.js环境中运行

const https = require('https');
const http = require('http');

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'test-key';

async function testRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: JSON.parse(data)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data
          });
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function runTests() {
  console.log('🔐 开始测试MCP服务器认证功能\n');
  console.log(`服务器地址: ${SERVER_URL}`);
  console.log(`测试API Key: ${API_KEY}`);
  console.log('---');

  // 测试1: 无认证请求
  console.log('📝 测试1: 无认证请求');
  try {
    const response = await testRequest(`${SERVER_URL}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
      })
    });
    
    console.log(`状态码: ${response.status}`);
    console.log(`预期: 401 Unauthorized`);
    console.log(`结果: ${response.status === 401 ? '✅ 通过' : '❌ 失败'}`);
  } catch (error) {
    console.log(`错误: ${error.message}`);
  }

  console.log('---');

  // 测试2: 带认证请求
  console.log('📝 测试2: 带认证请求');
  try {
    const response = await testRequest(`${SERVER_URL}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {}
      })
    });
    
    console.log(`状态码: ${response.status}`);
    console.log(`预期: 200 OK`);
    console.log(`结果: ${response.status === 200 ? '✅ 通过' : '❌ 失败'}`);
    
    if (response.status === 200) {
      console.log(`服务器信息: ${JSON.stringify(response.data?.result?.serverInfo || {}, null, 2)}`);
    }
  } catch (error) {
    console.log(`错误: ${error.message}`);
  }

  console.log('---');

  // 测试3: 错误的API Key
  console.log('📝 测试3: 错误的API Key');
  try {
    const response = await testRequest(`${SERVER_URL}/api/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong-api-key'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'initialize',
        params: {}
      })
    });
    
    console.log(`状态码: ${response.status}`);
    console.log(`预期: 401 Unauthorized`);
    console.log(`结果: ${response.status === 401 ? '✅ 通过' : '❌ 失败'}`);
  } catch (error) {
    console.log(`错误: ${error.message}`);
  }

  console.log('---');

  // 测试4: OAuth元数据端点
  console.log('📝 测试4: OAuth元数据端点');
  try {
    const response = await testRequest(`${SERVER_URL}/.well-known/oauth-protected-resource`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log(`状态码: ${response.status}`);
    console.log(`预期: 200 OK`);
    console.log(`结果: ${response.status === 200 ? '✅ 通过' : '❌ 失败'}`);
    
    if (response.status === 200) {
      console.log(`资源服务器元数据: ${JSON.stringify(response.data, null, 2)}`);
    }
  } catch (error) {
    console.log(`错误: ${error.message}`);
  }

  console.log('---');
  console.log('🏁 测试完成');
}

// 运行测试
runTests().catch(console.error);