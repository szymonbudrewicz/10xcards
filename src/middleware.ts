import { defineMiddleware } from "astro:middleware";
import { AUTH_UNAVAILABLE_MESSAGE, authErrorLogFields, classifyGetUserError } from "@/lib/auth-session";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard", "/generate", "/cards"];

export const onRequest = defineMiddleware(async (context, next) => {
  // Dev-only pages (e.g. /dev/kitchen-sink) do not exist outside `astro dev`.
  if (context.url.pathname.startsWith("/dev/") && !import.meta.env.DEV) {
    return new Response(null, { status: 404 });
  }

  const supabase = createClient(context.request.headers, context.cookies);
  context.locals.user = null;
  context.locals.authUnavailable = false;

  if (supabase) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    const outcome = classifyGetUserError(error);

    if (outcome === "unavailable") {
      // eslint-disable-next-line no-console
      console.error("auth: getUser failed", authErrorLogFields(error));
      context.locals.authUnavailable = true;
    } else if (outcome === "rejected") {
      // eslint-disable-next-line no-console
      console.warn("auth: getUser rejected", authErrorLogFields(error));
    } else {
      context.locals.user = user ?? null;
    }
  }

  // A signed-in user has no reason to see the sign-in form (also matches "/auth/signin/").
  if (context.url.pathname.replace(/\/$/, "") === "/auth/signin" && context.locals.user) {
    return context.redirect("/dashboard");
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    // An outage is not a sign-out: never send the user to a sign-in form that cannot work.
    if (context.locals.authUnavailable) {
      return new Response(AUTH_UNAVAILABLE_MESSAGE, {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
