import { supabase } from "./supabaseClient";

// Backs the app's key/value persistence with a single Supabase table
// (`app_state`, one row per user per key — see supabase/migrations/0001_init.sql)
// instead of the artifact sandbox's window.storage.

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

export async function loadKey(key, fallback, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const userId = await currentUserId();
      if (!userId) return { value: fallback, failed: false };
      const { data, error } = await supabase
        .from("app_state")
        .select("value")
        .eq("user_id", userId)
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return { value: data ? data.value : fallback, failed: false };
    } catch (e) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
        continue;
      }
      return { value: fallback, failed: true };
    }
  }
}

export async function saveKey(key, value) {
  try {
    const userId = await currentUserId();
    if (!userId) return false;
    const { error } = await supabase
      .from("app_state")
      .upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("storage save failed", key, e);
    return false;
  }
}

export async function deleteKey(key) {
  try {
    const userId = await currentUserId();
    if (!userId) return false;
    const { error } = await supabase.from("app_state").delete().eq("user_id", userId).eq("key", key);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("storage delete failed", key, e);
    return false;
  }
}
