import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware(async (context, next) => {
  // Dev-only pages (e.g. /dev/kitchen-sink) do not exist outside `astro dev`.
  if (context.url.pathname.startsWith("/dev/") && !import.meta.env.DEV) {
    return new Response(null, { status: 404 });
  }

  const supabase = createClient(context.request.headers, context.cookies);

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  // A signed-in user has no reason to see the sign-in form (also matches "/auth/signin/").
  if (context.url.pathname.replace(/\/$/, "") === "/auth/signin" && context.locals.user) {
    return context.redirect("/dashboard");
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
