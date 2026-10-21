import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect("/auth/signin?error=auth_unavailable");
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Only the code goes into the URL; the page maps it to a message (src/lib/auth-errors.ts).
    return context.redirect(`/auth/signin?error=${encodeURIComponent(error.code ?? "unknown")}`);
  }

  return context.redirect("/dashboard");
};
