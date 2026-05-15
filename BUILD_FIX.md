# 构建错误修复指南

## 问题描述
在Vercel部署时遇到TypeScript构建错误：
```
Type '{ type: string; text: string; }[]' is not assignable to type '...'
```

## 修复方案

### 1. 更新依赖版本（已完成）
已将 `package.json` 中的依赖更新到最新版本：
- `mcp-handler`: `^1.0.0` → `^2.0.0`
- `@modelcontextprotocol/sdk`: `^1.0.0` → `^2.0.0`

### 2. 重新部署到Vercel

**方法一：清除缓存重新部署**
1. 登录 Vercel 控制台
2. 进入项目 `uapi-pro-mcp-server`
3. 点击 **Settings** 标签
4. 找到 **Build & Development Settings**
5. 点击 **Clear Build Cache**
6. 然后点击 **Deployments** → 找到最新部署 → **⋯** → **Redeploy**

**方法二：推送代码触发自动部署**
```bash
# 已经推送了代码，应该会自动触发部署
# 如果没有自动部署，可以手动触发：
cd uapi-pro-mcp-server
git commit --allow-empty -m "触发重新部署"
git push
```

### 3. 如果问题仍然存在

#### 选项A：修改代码避免类型错误
如果更新依赖后仍然有类型错误，可以尝试以下修改：

在 `app/api/mcp/route.ts` 中，将返回的 `content` 数组类型显式声明：

```typescript
// 在返回之前，显式声明类型
const content: { type: 'text'; text: string }[] = [
  {
    type: 'text',
    text: `搜索"${query}"完成，找到 ${result.total_results} 个结果，耗时 ${result.process_time_ms}ms`
  },
  ...formattedResults
];

return { content };
```

#### 选项B：使用类型断言
```typescript
return {
  content: [
    {
      type: 'text' as const,
      text: `搜索"${query}"完成...`
    },
    ...formattedResults
  ] as { type: 'text'; text: string }[]
};
```

### 4. 验证修复

部署完成后，测试服务器：
```bash
# 测试认证
curl -X POST https://your-domain.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# 测试搜索工具
curl -X POST https://your-domain.vercel.app/api/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "search_web",
      "arguments": {
        "query": "测试搜索"
      }
    }
  }'
```

### 5. 常见问题

**Q: 为什么会出现类型错误？**
A: 可能是因为 `mcp-handler` 或 `@modelcontextprotocol/sdk` 的版本更新导致API签名变化。更新到最新版本通常可以解决。

**Q: 清除缓存后还是失败怎么办？**
A: 检查Vercel构建日志，看是否有其他错误。可能是环境变量配置问题。

**Q: 本地构建成功，但Vercel失败？**
A: 可能是Node.js版本差异。在Vercel项目设置中指定Node.js版本（如18.x或20.x）。

## 需要帮助？

如果问题仍然存在，请提供：
1. Vercel构建日志的完整错误信息
2. 本地 `npm run build` 的结果
3. 当前的 `package.json` 依赖版本