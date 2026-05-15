import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from 'mcp-handler';

// OAuth资源服务器元数据
const handler = protectedResourceHandler({
  authServerUrls: [process.env.NEXT_PUBLIC_APP_URL || 'https://your-domain.vercel.app'],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };