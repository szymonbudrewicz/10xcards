declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    /** Supabase Auth could not answer this request (network/5xx), so `user` is unknown, not absent. */
    authUnavailable: boolean;
  }
}
