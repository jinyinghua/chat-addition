import { z } from 'zod';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { searchUapiPro } from '@/lib/uapi-search';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function fetchImageAsBase64(imageUrl: string) {
  const response = await fetch(imageUrl, {
    headers: {
      'User-Agent': 'uapi-pro-mcp-server/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`图片下载失败: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const arrayBuffer = await response.arrayBuffer();

  if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`图片过大，当前限制 ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB`);
  }

  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return { contentType, base64 };
}

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

    server.tool(
      'read_image',
      '读取一个图片链接并转换为模型可处理的图片数据',
      {
        image_url: z.string().url().describe('可公开访问的图片链接')
      },
      async ({ image_url }) => {
        try {
          const { contentType, base64 } = await fetchImageAsBase64(image_url);
          return {
            content: [
              {
                type: 'text' as const,
                text: `图片读取成功: ${contentType}`
              },
              {
                type: 'image' as const,
                data: base64,
                mimeType: contentType
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `图片读取失败: ${error instanceof Error ? error.message : '未知错误'}`
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
