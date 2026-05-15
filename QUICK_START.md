# 🚀 快速开始

## 1. 克隆或下载项目

```bash
# 如果你有git
git clone <repository-url>
cd uapi-pro-mcp-server

# 或者直接使用已下载的文件
cd uapi-pro-mcp-server
```

## 2. 安装依赖

```bash
# 需要Node.js 18+环境
npm install
```

## 3. 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env.local

# 编辑.env.local文件
# 必填: MCP_API_KEYS=your-api-key-1,your-api-key-2
# 可选: UAPI_PRO_API_KEY=your-uapi-pro-key
```

### 生成API Key

```bash
# 生成安全的API Key
openssl rand -hex 32

# 将生成的key复制到.env.local文件的MCP_API_KEYS中
```

## 4. 启动开发服务器

```bash
npm run dev
```

服务器将在 http://localhost:3000 启动。

## 5. 测试服务器

### 测试认证（使用curl）

```bash
# 测试无认证请求（应该返回401）
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# 测试带认证请求（应该成功）
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### 测试搜索功能

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_web",
      "arguments": {
        "query": "最新AI技术",
        "sort": "date"
      }
    }
  }'
```

## 6. 部署到Vercel

```bash
# 安装Vercel CLI（如果还没安装）
npm i -g vercel

# 登录Vercel
vercel login

# 部署到生产环境
vercel --prod
```

## 7. 配置MCP客户端

### Claude Desktop配置

```json
{
  "mcpServers": {
    "uapi-search": {
      "url": "https://your-domain.vercel.app/api/mcp",
      "headers": {
        "Authorization": "Bearer your-api-key"
      }
    }
  }
}
```

## 🎯 常见问题

### Q: 没有Node.js环境怎么办？
A: 你需要安装Node.js 18+版本。可以从 https://nodejs.org 下载。

### Q: API Key在哪里生成？
A: 使用命令 `openssl rand -hex 32` 生成，然后复制到`.env.local`文件中。

### Q: 部署后如何测试？
A: 部署后使用curl测试，或者在MCP客户端中配置服务器地址。

### Q: 支持哪些MCP客户端？
A: 支持所有标准MCP客户端，如Claude Desktop、Cursor、VS Code Copilot等。

## 📞 需要帮助？

查看项目中的`README.md`和`PROJECT_SUMMARY.md`获取详细信息。