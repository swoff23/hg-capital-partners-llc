import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth-allowlist";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const supabase = await getSupabaseServer();

  if (code && supabase) {
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    const email = data.user?.email;
    if (!isAllowedEmail(email)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=not_allowed`);
    }
  }
  return NextResponse.redirect(`${origin}/`);
}
