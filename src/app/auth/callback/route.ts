import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/auth-allowlist";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await getSupabaseServer();
  if (!supabase) return NextResponse.redirect(`${origin}/login`);

  let email: string | undefined;
  if (code) {
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    email = data.user?.email;
  } else if (tokenHash && type) {
    const { data } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    email = data.user?.email;
  }

  if (!isAllowedEmail(email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }
  return NextResponse.redirect(`${origin}/`);
}
