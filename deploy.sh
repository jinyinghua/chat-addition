#!/bin/bash

echo "🚀 部署UAPI Pro MCP服务器到Vercel"

# 检查是否安装了Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo "❌ 未找到Vercel CLI，请先安装:"
    echo "   npm i -g vercel"
    exit 1
fi

# 检查是否登录
echo "📋 检查Vercel登录状态..."
if ! vercel whoami &> /dev/null; then
    echo "🔐 请先登录Vercel:"
    vercel login
fi

# 检查环境变量
echo "🔍 检查环境变量配置..."
if [ ! -f ".env.local" ]; then
    echo "⚠️  未找到.env.local文件，请从.env.example创建:"
    echo "   cp .env.example .env.local"
    echo "   然后编辑.env.local文件，填入你的API keys"
    exit 1
fi

# 读取API keys
if grep -q "MCP_API_KEYS=key1,key2,key3" .env.local; then
    echo "⚠️  请更新.env.local中的MCP_API_KEYS为你自己的keys"
    echo "   生成新key: openssl rand -hex 32"
    exit 1
fi

echo "✅ 环境变量配置正确"

# 部署到Vercel
echo "🚀 开始部署..."
vercel --prod

echo "✅ 部署完成！"
echo ""
echo "📝 下一步:"
echo "1. 在Vercel项目设置中配置环境变量"
echo "2. 测试服务器: curl -X POST https://your-domain.vercel.app/api/mcp -H \"Authorization: Bearer your-key\" -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{}}'"
echo "3. 在MCP客户端中配置服务器地址"