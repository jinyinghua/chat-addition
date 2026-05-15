import { z } from 'zod';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { searchUapiPro } from '@/lib/uapi-search';

const handler = createMcpHandler(
  (server) => {
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

          return {
            content: [
              {
                type: 'text' as const,
                text: `搜索“${query}”完成，找到 ${result.total_results} 个结果，耗时 ${result.process_time_ms}ms`
              },
              ...result.results.map((item, index) => ({
                type: 'text' as const,
                text: `**${index + 1}. ${item.title}**\n链接: ${item.url}\n来源: ${item.domain}\n摘要: ${item.snippet}${item.publish_time ? `\n发布时间: ${item.publish_time}` : ''}`
              }))
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
  {},
  {
    basePath: '/api'
  }
);

const verifyApiKey = async (
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> => {
  void req;

  const validApiKeys = process.env.MCP_API_KEYS?.split(',').map((key) => key.trim()).filter(Boolean) || [];

  if (validApiKeys.length === 0) {
    console.warn('⚠️ 没有配置MCP_API_KEYS环境变量，允许所有请求');
    return {
      token: bearerToken || 'dev-token',
      clientId: 'dev-user',
      scopes: ['search'],
      extra: { userId: 'dev-user' }
    };
  }

  if (!bearerToken) {
    return undefined;
  }

  if (!validApiKeys.includes(bearerToken)) {
    return undefined;
  }

  return {
    token: bearerToken,
    clientId: `user-${bearerToken.slice(0, 8)}`,
    scopes: ['search'],
    extra: {
      authenticatedAt: new Date().toISOString(),
      tokenPrefix: `${bearerToken.slice(0, 8)}...`
    }
  };
};

const authHandler = withMcpAuth(handler, verifyApiKey, {
  required: true,
  requiredScopes: ['search'],
  resourceMetadataPath: '/.well-known/oauth-protected-resource'
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
