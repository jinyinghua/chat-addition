import { z } from 'zod';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { searchUapiPro } from '@/lib/uapi-search';
import { fetchImageAsBase64 } from '@/lib/chatgpt-proxy';
import { createOrGetImageJob, ensureImageJobStarted, waitForImageJob } from '@/lib/image-job-service';
import { getPublicBaseUrl, buildImageJobFileUrl } from '@/lib/app-url';

type McpToolContent =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

function textContent(text: string): McpToolContent {
  return { type: 'text', text };
}

function imageContent(data: string, mimeType: string): McpToolContent {
  return { type: 'image', data, mimeType };
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
      async ({ query, site, filetype, fetch_full, sort, time_range }) => {
        try {
          const result = await searchUapiPro({ query, site, filetype, fetch_full, sort, time_range });
          return {
            content: [
              textContent(`搜索“${query}”完成，找到 ${result.total_results} 个结果，耗时 ${result.process_time_ms}ms`),
              ...result.results.map((item, index) =>
                textContent(`**${index + 1}. ${item.title}**\n链接: ${item.url}\n来源: ${item.domain}\n摘要: ${item.snippet}${item.publish_time ? `\n发布时间: ${item.publish_time}` : ''}`)
              )
            ]
          };
        } catch (error) {
          return {
            content: [textContent(`搜索失败: ${error instanceof Error ? error.message : '未知错误'}`)],
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
            content: [textContent(`data:${contentType};base64,${base64}`)]
          };
        } catch (error) {
          return {
            content: [textContent(`图片读取失败: ${error instanceof Error ? error.message : '未知错误'}`)],
            isError: true
          };
        }
      }
    );

    server.tool(
      'generate_image',
      '调用上游 gpt-image-2 生成图片，返回图片URL以及可直接给模型使用的图片数据',
      {
        prompt: z.string().describe('图片生成提示词'),
        model: z.string().optional().default('gpt-image-2').describe('图片模型，默认 gpt-image-2'),
        size: z.string().optional().default('auto').describe('图片尺寸'),
        quality: z.string().optional().default('auto').describe('图片质量'),
        background: z.string().optional().default('auto').describe('背景设置'),
        n: z.number().int().min(1).max(4).optional().default(1).describe('生成数量')
      },
      async ({ prompt, model, size, quality, background, n }, extra) => {
        try {
          const token = extra.authInfo?.token || '';
          const { job } = await createOrGetImageJob({
            ownerToken: token,
            model,
            prompt,
            size,
            quality,
            background,
            responseFormat: 'url',
            n,
            inputImages: [],
          });
          await ensureImageJobStarted(job);
          const waited = await waitForImageJob(job.id, 240000);
          if (!waited || waited.status !== 'succeeded' || !waited.result) {
            return {
              content: [textContent(waited?.error || '图片生成未完成，请稍后重试')],
              isError: true
            };
          }

          const baseUrl = getPublicBaseUrl();
          const content: McpToolContent[] = [];
          content.push(
            textContent(
              `图片生成成功，共 ${waited.result.assets.length} 张。你可以把这些 URL 直接嵌入回答中。\n` +
                waited.result.assets.map((_, index) => `${index + 1}. ${buildImageJobFileUrl(baseUrl, waited.id, index)}`).join('\n')
            )
          );

          waited.result.assets.forEach((asset, index) => {
            const url = buildImageJobFileUrl(baseUrl, waited.id, index);
            content.push(textContent(`图片 ${index + 1} URL: ${url}`));
            if (asset.b64Json) {
              content.push(imageContent(asset.b64Json, asset.mimeType || 'image/png'));
            }
          });

          return { content };
        } catch (error) {
          return {
            content: [textContent(`图片生成失败: ${error instanceof Error ? error.message : '未知错误'}`)],
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
