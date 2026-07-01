import { supabase } from "@/integrations/supabase/client";

/**
 * Resolve a valid Supabase access token for edge function calls.
 * Tries the in-memory session first, then storage, then refresh.
 */
export async function getAccessToken(
  sessionFromAuth?: { access_token: string } | null,
): Promise<string> {
  if (sessionFromAuth?.access_token) {
    return sessionFromAuth.access_token;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return session.access_token;
  }

  const { data: refreshed, error } = await supabase.auth.refreshSession();
  if (!error && refreshed.session?.access_token) {
    return refreshed.session.access_token;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (!userError && userData.user) {
    const { data: retrySession } = await supabase.auth.getSession();
    if (retrySession.session?.access_token) {
      return retrySession.session.access_token;
    }
  }

  throw new Error("Not authenticated. Please sign in again.");
}

/**
 * Read a streaming SSE body from a Grok-backed edge function and call onDelta
 * for each text chunk. Throws on embedded error events.
 */
export async function readGrokSseStream(
  response: Response,
  onDelta: (text: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body from assistant");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          throw new Error(parsed.error);
        }
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullText += content;
          onDelta(content);
        }
      } catch (e) {
        if (e instanceof Error && !e.message.includes("JSON")) {
          throw e;
        }
      }
    }
  }

  if (!fullText.trim()) {
    throw new Error("The assistant returned an empty response. Please try again.");
  }

  return fullText;
}
