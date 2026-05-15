import { z } from 'zod';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { searchUapiPro } from '@/lib/uapi-search';

// 创建MCP处理器
const handler = createMcpHandler(
  (server) => {
    // 注册搜索工具
    server.tool(
      'search_web',
      '使用UAPI Pro搜索API进行智能网页搜索',
      {
        query: z.string().describe('搜索查询关键词，支持中英文'),
        site: z.string().optional().describe('限制搜索特定网站，不需要site:前缀'),
        filetype: z.string().optional().describe('限制文件类型，支持pdf、doc、docx等'),
        fetch_full: z.boolean().optional().default(false).describe('是否获取页面完整正文'),
        sort: z.enum(['relevance', 'date']).optional().default('relevance').describe('排序方式'),
        time_range: z.enum(['day', 'week', 'month', 'year']).optional().describe('时间范围过滤')
      },
      async ({ query, site, filetype, fetch_full, sort, time_range }, { authInfo }) => {
        try {
          // 从authInfo中获取用户信息（如果需要的话）
          const userId = authInfo?.clientId || 'anonymous';
          void userId;

          const result = await searchUapiPro({
            query,
            site,
            filetype,
            fetch_full,
            sort,
            time_range
          });

          // 格式化搜索结果为MCP响应
          const formattedResults = result.results.map((item, index) => ({
            type: 'text' as const,
            text: `**${index + 1}. ${item.title}**\n链接: ${item.url}\n来源: ${item.domain}\n摘要: ${item.snippet}${item.publish_time ? `\n发布时间: ${item.publish_time}` : ''}`
          })) as { type: 'text'; text: string }[];

          return {
            content: [
              {
                type: 'text' as const,
                text: `搜索"${query}"完成，找到 ${result.total_results} 个结果，耗时 ${result.process_time_ms}ms`
              },
              ...formattedResults
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `搜索失败: ${error instanceof Error ? error.message : '未知错误'}`
              }
            ],
            isError: true
          };
        }
      }
    );
  },
  {
    name: 'uapi-pro-search-server',
    version: '1.0.0'
  },
  {
    basePath: '/api'
  }
);

// API key验证函数
const verifyApiKey = async (
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  void req;
  // 从环境变量获取有效的API keys
  const validApiKeys = process.env.MCP_API_KEYS?.split(',') || [];

  // 如果没有配置APIkeys，则允许所有请求（开发模式）
  if (validApiKeys.length === 0) {
    console.warn('⚠️ 没有配置MCP_API_KEYS环境变量，允许所有请求');
    return {
      token: bearerToken || 'dev-token',
      clientId: 'dev-user',
      scopes: ['search'],
      extra: { userId: 'dev-user' }
    };
  }

  // 检查Bearer token
  if (!bearerToken) {
    return undefined; // 返回undefined表示认证失败
  }

  // 验证token是否在有效列表中
  const isValid = validApiKeys.includes(bearerToken);

  if (!isValid) {
    return undefined; // 认证失败
  }

  // 认证成功，返回AuthInfo
  return {
    token: bearerToken,
    scopes: ['search'], // 可以根据token设置不同的权限
    clientId: `user-${bearerToken.slice(0, 8)}`,
    extra: {
      authenticatedAt: new Date().toISOString(),
      tokenPrefix: bearerToken.slice(0, 8) + '...'
    }
  };
};

// 包装handler，添加认证
const authHandler = withMcpAuth(handler, verifyApiKey, {
  required: true,
  requiredScopes: ['search'],
  resourceMetadataPath: '/.well-known/oauth-protected-resource'
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
