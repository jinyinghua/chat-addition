# UAPI Pro 搜索 MCP 服务器

基于 Vercel Serverless 的 MCP 服务器，提供 UAPI Pro 搜索 API 功能，支持 API Key 认证。

## 功能特性

- 🔐 **API Key 认证** - 基于 Bearer Token 的安全认证
- 🚀 **Vercel Serverless** - 无状态、自动扩缩容
- 🌐 **智能搜索** - 支持多种搜索参数和过滤条件
- 📱 **兼容性强** - 支持标准 MCP 客户端

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env.local` 文件：

```env
# UAPI Pro API Key (可选，但推荐)
UAPI_PRO_API_KEY=your-uapi-pro-api-key

# MCP API Keys (用于认证，逗号分隔)
MCP_API_KEYS=key1,key2,key3

# 应用URL (用于OAuth元数据)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. 本地开发

```bash
npm run dev
```

服务器将在 http://localhost:3000 启动。

### 4. 测试认证

```bash
# 测试无认证请求（应该返回401）
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# 测试带认证请求（应该成功）
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer key1" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

### 5. 部署到 Vercel

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录 Vercel
vercel login

# 部署
vercel --prod
```

## 客户端配置

### Claude Desktop

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

### Cursor

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

## 可用工具

### `search_web`

使用 UAPI Pro 搜索 API 进行智能网页搜索。

**参数：**
- `query` (必填): 搜索查询关键词
- `site` (可选): 限制搜索特定网站
- `filetype` (可选): 限制文件类型 (pdf, doc, docx 等)
- `fetch_full` (可选): 是否获取完整正文
- `sort` (可选): 排序方式 (relevance/date)
- `time_range` (可选): 时间范围 (day/week/month/year)

**示例：**
```json
{
  "name": "search_web",
  "arguments": {
    "query": "最新AI技术",
    "sort": "date",
    "time_range": "week"
  }
}
```

## 生成 API Key

```bash
# 生成安全的 API Key
openssl rand -hex 32

# 或者更长的 Key
openssl rand -base64 48
```

## 安全说明

1. **API Key 存储** - 将 API Key 存储在 Vercel 环境变量中，不要提交到代码仓库
2. **HTTPS** - 生产环境强制使用 HTTPS
3. **认证失败** - 未认证的请求会返回 401 Unauthorized
4. **作用域控制** - 可以为不同的 API Key 设置不同的权限

## 故障排除

### 认证失败

- 检查 `MCP_API_KEYS` 环境变量是否正确设置
- 确保请求头中的 `Authorization` 格式为 `Bearer your-api-key`
- 检查 API Key 是否有效（未过期、未被撤销）

### 搜索失败

- 检查 `UAPI_PRO_API_KEY` 环境变量是否正确设置
- 确认网络连接正常
- 检查 UAPI Pro API 服务状态

## 许可证

MIT License