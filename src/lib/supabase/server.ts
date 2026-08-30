import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_CONFIGURED } from "@/lib/auth-allowlist";

/** Server-side Supabase client bound to the request cookies. Returns null if unconfigured. */
export async function getSupabaseServer() {
  if (!SUPABASE_CONFIGURED) return null;
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component — refresh is handled in proxy.ts
          }
        },
      },
    },
  );
}
