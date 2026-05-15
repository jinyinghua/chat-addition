interface SearchParams {
  query: string;
  site?: string;
  filetype?: string;
  fetch_full?: boolean;
  sort?: 'relevance' | 'date';
  time_range?: 'day' | 'week' | 'month' | 'year';
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
  source: string;
  position: number;
  score: number;
  publish_time?: string;
}

interface SearchResponse {
  query: string;
  total_results: number;
  results: SearchResult[];
  sources: Array<{
    name: string;
    status: string;
    result_count: number;
    elapsed_ms: number;
    first_result_host: string;
  }>;
  process_time_ms: number;
  metadata: {
    request_params: {
      query: string;
      limit: number;
      page: number;
      timeout_ms: number;
      sort: string;
    };
    dedupe_removed: number;
    rerank_applied: boolean;
    content_fetched: number;
  };
}

export async function searchUapiPro(params: SearchParams): Promise<SearchResponse> {
  const API_URL = 'https://uapis.cn/api/v1/search/aggregate';
  const API_KEY = process.env.UAPI_PRO_API_KEY; // 从环境变量读取

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  // 如果有API Key，添加认证头
  if (API_KEY) {
    headers['Authorization'] = `Bearer ${API_KEY}`;
  }

  const body = {
    query: params.query,
    ...(params.site && { site: params.site }),
    ...(params.filetype && { filetype: params.filetype }),
    fetch_full: params.fetch_full || false,
    sort: params.sort || 'relevance',
    ...(params.time_range && { time_range: params.time_range })
  };

  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`UAPI Pro API错误: ${response.status} - ${errorData.message || '未知错误'}`);
  }

  return response.json();
}