// Isolation check: proves that account B cannot read, change, delete or impersonate account A's cards,
// and that anon has no access. Zero dependencies on purpose. Local Supabase only, with the migrations
// applied (npx supabase start) and email confirmation disabled (sign up must return a session):
//   POSIX:
//     eval "$(npx supabase status -o env | grep -E '^(API_URL|ANON_KEY)=' | sed 's/^API_URL=/export SUPABASE_URL=/;s/^ANON_KEY=/export SUPABASE_KEY=/')"
//   PowerShell:
//     npx supabase status -o env | ForEach-Object { if ($_ -match '^API_URL="?([^"]*)"?$') { $env:SUPABASE_URL = $Matches[1] } elseif ($_ -match '^ANON_KEY="?([^"]*)"?$') { $env:SUPABASE_KEY = $Matches[1] } }
//   then: npm run isolation
// It creates throwaway accounts, so it refuses to run against anything but a loopback address and
// never reads .dev.vars (which may point at production).

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost"];

function abort(message) {
  console.error(`isolation-check: ${message}`);
  process.exit(1);
}

const rawUrl = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!rawUrl || !key) abort("SUPABASE_URL and SUPABASE_KEY must be set in the environment (local Supabase only).");
if (/\s/.test(key)) abort("SUPABASE_KEY must be a single key without whitespace.");

let parsed;
try {
  parsed = new URL(rawUrl);
} catch {
  abort("SUPABASE_URL is not a valid URL (expected http://127.0.0.1:<port>).");
}
if (!["http:", "https:"].includes(parsed.protocol)) abort("SUPABASE_URL must start with http:// or https://.");
if (!LOOPBACK_HOSTS.includes(parsed.hostname)) {
  abort(
    `refusing to run against host "${parsed.hostname}": this script creates accounts and only runs on local Supabase.`,
  );
}
const base = parsed.origin;

async function call(path, { method = "GET", token, body, returnRows = false } = {}) {
  const response = await fetch(base + path, {
    method,
    redirect: "error",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(returnRows ? { Prefer: "return=representation" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-JSON body, keep the raw text for diagnostics
  }
  return { status: response.status, ok: response.ok, json, text: text.slice(0, 200) };
}

function rowsOf(result) {
  return Array.isArray(result.json) ? result.json : [];
}

function isClientError(result) {
  return result.status >= 400 && result.status < 500;
}

// 23514 = check_violation; proves the CHECK constraint fired, not an RLS or request error.
function isCheckViolation(result) {
  return result.status === 400 && result.json?.code === "23514";
}

function describe(result) {
  return `status ${result.status}, body ${result.text || "(empty)"}`;
}

let failed = 0;
function check(name, passed, failureMessage) {
  console.log(passed ? `PASS  ${name}` : `FAIL  ${name}: ${failureMessage}`);
  if (!passed) failed++;
}

async function signUp(label) {
  const email = `isolation-${label}-${Date.now()}@example.com`;
  const password = `Iso-${crypto.randomUUID()}`;
  const result = await call("/auth/v1/signup", { method: "POST", body: { email, password } });
  const token = result.json?.access_token;
  const id = result.json?.user?.id;
  if (!token || !id) {
    abort(
      `sign up as ${label.toUpperCase()} returned no session (${describe(result)}); is email confirmation disabled locally?`,
    );
  }
  return { email, token, id };
}

const front = "Isolation front";
const back = "Isolation back";

try {
  const a = await signUp("a");
  const b = await signUp("b");

  // A creates a card; the default owner must be A without sending user_id.
  const created = await call("/rest/v1/cards", {
    method: "POST",
    token: a.token,
    body: { front, back },
    returnRows: true,
  });
  const card = rowsOf(created)[0];
  check(
    "insert as A creates a card owned by A",
    created.status === 201 && card?.user_id === a.id,
    card
      ? `insert as A stored user_id ${card.user_id} instead of A's id`
      : `insert as A did not return the new row (${describe(created)})`,
  );
  if (!card) abort("cannot continue without A's card.");
  const byId = `/rest/v1/cards?id=eq.${card.id}`;

  const ownSelect = await call(byId, { token: a.token });
  check(
    "select as A returns A's own card",
    rowsOf(ownSelect).some((row) => row.id === card.id),
    `select as A did not return A's own card (${describe(ownSelect)})`,
  );

  // B must see nothing.
  const bAll = await call("/rest/v1/cards", { token: b.token });
  check(
    "select all as B returns no rows",
    bAll.ok && rowsOf(bAll).length === 0,
    `select all as B returned ${rowsOf(bAll).length} row(s), including A's row (${describe(bAll)})`,
  );
  const bById = await call(byId, { token: b.token });
  check(
    "select A's card by id as B returns no rows",
    bById.ok && rowsOf(bById).length === 0,
    `select by A's card id as B returned A's row (${describe(bById)})`,
  );

  // B must not change A's card.
  const bUpdate = await call(byId, {
    method: "PATCH",
    token: b.token,
    body: { front: "changed by B" },
    returnRows: true,
  });
  const afterBUpdate = rowsOf(await call(byId, { token: a.token }))[0];
  check(
    "update A's card as B changes nothing",
    bUpdate.ok && Array.isArray(bUpdate.json) && bUpdate.json.length === 0 && afterBUpdate?.front === front,
    `update as B modified A's row (A's front is now "${afterBUpdate?.front}", ${describe(bUpdate)})`,
  );

  // B must not delete A's card.
  const bDelete = await call(byId, { method: "DELETE", token: b.token, returnRows: true });
  const afterBDelete = rowsOf(await call(byId, { token: a.token }));
  check(
    "delete A's card as B deletes nothing",
    bDelete.ok && Array.isArray(bDelete.json) && bDelete.json.length === 0 && afterBDelete.length === 1,
    `delete as B removed A's row (A now sees ${afterBDelete.length} row(s), ${describe(bDelete)})`,
  );

  // B must not create a card owned by A.
  const bImpersonate = await call("/rest/v1/cards", {
    method: "POST",
    token: b.token,
    body: { user_id: a.id, front, back },
    returnRows: true,
  });
  const aCountAfterImpersonation = rowsOf(await call("/rest/v1/cards", { token: a.token })).length;
  check(
    "insert as B with A's user_id is rejected",
    isClientError(bImpersonate) && aCountAfterImpersonation === 1,
    `insert as B with A's user_id was accepted (${describe(bImpersonate)}, A now has ${aCountAfterImpersonation} card(s))`,
  );

  // A must not hand the card over to B (UPDATE ... WITH CHECK).
  const reassign = await call(byId, { method: "PATCH", token: a.token, body: { user_id: b.id }, returnRows: true });
  const afterReassign = rowsOf(await call(byId, { token: a.token }))[0];
  check(
    "update as A reassigning the card to B is rejected",
    isClientError(reassign) && afterReassign?.user_id === a.id,
    `update as A reassigned the card to B (owner is now ${afterReassign?.user_id ?? "not visible to A"}, ${describe(reassign)})`,
  );

  // Constraints from the migration: blank front/back are rejected.
  const blankFront = await call("/rest/v1/cards", { method: "POST", token: a.token, body: { front: "   ", back } });
  check(
    "insert with blank front is rejected",
    isCheckViolation(blankFront),
    `insert with blank front was not rejected by the CHECK constraint (${describe(blankFront)})`,
  );
  const tabFront = await call("/rest/v1/cards", { method: "POST", token: a.token, body: { front: "\t\t", back } });
  check(
    "insert with tab-only front is rejected",
    isCheckViolation(tabFront),
    `insert with tab-only front was not rejected by the CHECK constraint (${describe(tabFront)})`,
  );
  const blankBack = await call("/rest/v1/cards", { method: "POST", token: a.token, body: { front, back: "" } });
  check(
    "insert with blank back is rejected",
    isCheckViolation(blankBack),
    `insert with blank back was not rejected by the CHECK constraint (${describe(blankBack)})`,
  );

  // anon: a permission error or zero rows are both fine, rows never.
  const anonSelect = await call("/rest/v1/cards");
  check(
    "select as anon returns a permission error or zero rows",
    anonSelect.status === 401 ||
      anonSelect.status === 403 ||
      (anonSelect.status === 200 && Array.isArray(anonSelect.json) && anonSelect.json.length === 0),
    `select as anon was neither denied nor empty (${describe(anonSelect)})`,
  );
  const anonInsert = await call("/rest/v1/cards", { method: "POST", body: { front, back } });
  check(
    "insert as anon is rejected",
    isClientError(anonInsert),
    `insert as anon was accepted (${describe(anonInsert)})`,
  );

  // Positive paths: A can still use the policies, and this doubles as cleanup.
  const ownUpdate = await call(byId, {
    method: "PATCH",
    token: a.token,
    body: { front: "edited by A" },
    returnRows: true,
  });
  check(
    "update as A changes A's own card",
    rowsOf(ownUpdate)[0]?.front === "edited by A",
    `update as A did not change A's own card (${describe(ownUpdate)})`,
  );
  const ownDelete = await call(byId, { method: "DELETE", token: a.token, returnRows: true });
  const afterOwnDelete = rowsOf(await call("/rest/v1/cards", { token: a.token }));
  check(
    "delete as A removes A's own card",
    rowsOf(ownDelete).length === 1 && afterOwnDelete.length === 0,
    `delete as A did not remove A's own card (${describe(ownDelete)}, A still sees ${afterOwnDelete.length} card(s))`,
  );

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll isolation checks passed");
  console.log(`Throwaway accounts left in the local Supabase Auth: ${a.email}, ${b.email}`);
} catch (error) {
  abort(`unexpected error: ${error instanceof Error ? error.message : String(error)}`);
}

process.exit(failed ? 1 : 0);
