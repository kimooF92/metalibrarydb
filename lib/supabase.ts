import { createClient, SupabaseClient } from "@supabase/supabase-js";

let clientInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!clientInstance) {
    const isServer = typeof window === "undefined";
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      "https://placeholder.supabase.co";

    // On server, prioritize service role key for storage uploads and background tasks
    // On client (browser), strictly use public anon key
    const supabaseKey = isServer
      ? process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        "placeholder"
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder";

    clientInstance = createClient(supabaseUrl, supabaseKey);
  }
  return clientInstance;
}

// Export getter and proxy object for backwards compatibility
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const instance = getSupabase();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
