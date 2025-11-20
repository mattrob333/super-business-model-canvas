interface GrokMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface GrokSearchParameters {
  mode: 'on' | 'off' | 'auto';
  sources?: ('web' | 'x')[];
  return_citations?: boolean;
}

interface StreamGrokChatOptions {
  messages: GrokMessage[];
  search_parameters?: GrokSearchParameters;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  onChunk?: (text: string) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

export async function streamGrokChat(options: StreamGrokChatOptions): Promise<string> {
  const apiKey = Deno.env.get('XAI_API_KEY');
  if (!apiKey) throw new Error('XAI_API_KEY not configured');

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || 'grok-4-1-fast-non-reasoning',
      messages: options.messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens,
      stream: true,
      ...(options.search_parameters && { search_parameters: options.search_parameters }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Grok API error:', response.status, errorText);
    throw new Error(`Grok API error: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullResponse = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      
      // Keep the last incomplete line in the buffer
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim() || line.startsWith(':')) continue;
        
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          
          if (data === '[DONE]') {
            if (options.onDone) options.onDone();
            return fullResponse;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            
            if (content) {
              fullResponse += content;
              if (options.onChunk) options.onChunk(content);
            }
          } catch (e) {
            // Skip invalid JSON chunks
            console.warn('Failed to parse SSE chunk:', data);
          }
        }
      }
    }

    if (options.onDone) options.onDone();
    return fullResponse;

  } catch (error) {
    console.error('Grok streaming error:', error);
    if (options.onError) options.onError(error as Error);
    throw error;
  }
}

export async function callGrokChat(options: Omit<StreamGrokChatOptions, 'onChunk' | 'onDone' | 'onError'>): Promise<string> {
  const apiKey = Deno.env.get('XAI_API_KEY');
  if (!apiKey) throw new Error('XAI_API_KEY not configured');

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model || 'grok-4-1-fast-non-reasoning',
      messages: options.messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.maxTokens,
      stream: false,
      ...(options.search_parameters && { search_parameters: options.search_parameters }),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Grok API error:', response.status, errorText);
    throw new Error(`Grok API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
