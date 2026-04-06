/**
 * Token Platform API Client
 * 兼容OpenAI格式的API客户端，用于与Token汇聚平台通信
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenPlatformConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
}

export class TokenPlatformClient {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private maxTokens: number;

  constructor(config: TokenPlatformConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.maxTokens = config.maxTokens ?? 4096;
  }

  /**
   * 发起流式聊天请求，通过回调逐步返回文本块
   */
  async streamChat(
    messages: ChatMessage[],
    onChunk: (text: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const url = `${this.baseUrl}/v1/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        max_tokens: this.maxTokens,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Token平台请求失败 (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('响应体为空，无法读取流数据');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // 保留最后一个可能不完整的行
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') {
            continue;
          }
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const content: string | undefined =
                json?.choices?.[0]?.delta?.content;
              if (content) {
                onChunk(content);
              }
            } catch {
              // 忽略无法解析的数据块
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 非流式聊天请求，返回完整响应
   */
  async chat(
    messages: ChatMessage[],
    signal?: AbortSignal
  ): Promise<string> {
    const url = `${this.baseUrl}/v1/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        max_tokens: this.maxTokens,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Token平台请求失败 (${response.status}): ${errorText}`);
    }

    const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return json?.choices?.[0]?.message?.content ?? '';
  }

  /**
   * 获取可用模型列表
   */
  async listModels(signal?: AbortSignal): Promise<string[]> {
    const url = `${this.baseUrl}/v1/models`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      signal,
    });

    if (!response.ok) {
      return [];
    }

    const json = await response.json() as { data?: Array<{ id: string }> };
    return (json?.data ?? []).map((m: { id: string }) => m.id);
  }
}
