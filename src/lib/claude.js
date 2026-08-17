import { supabase } from "./supabaseClient";

// Calls the `claude-proxy` Supabase Edge Function instead of the Anthropic API
// directly, so the API key never has to live in the browser.
// See supabase/functions/claude-proxy/index.ts.
export async function callClaude(messages) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("You must be signed in to use AI features.");

  const { data, error } = await supabase.functions.invoke("claude-proxy", {
    body: { messages },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw new Error(error.message || "API request failed");
  if (data?.error) throw new Error(data.error);
  return data?.text || "";
}
