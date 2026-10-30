// Isolation check: proves that account B cannot read, change, delete or impersonate account A's cards
// or generations (acceptance counters), that nobody moves the counters past accept_proposal(),
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

// P0002 = accept_proposal's "generation not found" (missing or someone else's). PostgREST answers it with 500,
// so the SQLSTATE, not the status, proves the function refused rather than failed for another reason.
function isGenerationNotFound(result) {
  return !result.ok && result.json?.code === "P0002";
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

  // Generations (acceptance counters) and accept_proposal().
  const generationCreated = await call("/rest/v1/generations", {
    method: "POST",
    token: a.token,
    body: { proposed_count: 3 },
    returnRows: true,
  });
  const generation = rowsOf(generationCreated)[0];
  check(
    "insert generation as A creates a generation owned by A with zero accepted",
    generationCreated.status === 201 && generation?.user_id === a.id && generation?.accepted_count === 0,
    generation
      ? `insert generation as A stored user_id ${generation.user_id}, accepted_count ${generation.accepted_count}`
      : `insert generation as A did not return the new row (${describe(generationCreated)})`,
  );
  if (!generation) abort("cannot continue without A's generation.");
  const generationById = `/rest/v1/generations?id=eq.${generation.id}`;
  const slotOfA = `/rest/v1/cards?generation_id=eq.${generation.id}`;
  const aGeneration = async () => rowsOf(await call(generationById, { token: a.token }))[0];
  const aGenerationCount = async () => rowsOf(await call("/rest/v1/generations", { token: a.token })).length;
  const aSlotCards = async () => rowsOf(await call(slotOfA, { token: a.token })).length;

  const bGenerations = await call("/rest/v1/generations", { token: b.token });
  const bGenerationById = await call(generationById, { token: b.token });
  check(
    "select generations as B returns none of A's rows",
    bGenerations.ok && rowsOf(bGenerations).length === 0 && bGenerationById.ok && rowsOf(bGenerationById).length === 0,
    `select generations as B returned A's row(s) (${describe(bGenerations)}; by id: ${describe(bGenerationById)})`,
  );

  const bImpersonateGeneration = await call("/rest/v1/generations", {
    method: "POST",
    token: b.token,
    body: { user_id: a.id, proposed_count: 3 },
    returnRows: true,
  });
  const aGenerationsAfterImpersonation = await aGenerationCount();
  check(
    "insert generation as B with A's user_id is rejected",
    isClientError(bImpersonateGeneration) && aGenerationsAfterImpersonation === 1,
    `insert generation as B with A's user_id was accepted (${describe(bImpersonateGeneration)}, A now has ${aGenerationsAfterImpersonation} generation(s))`,
  );

  for (const [label, account] of [
    ["A", a],
    ["B", b],
  ]) {
    const preAccepted = await call("/rest/v1/generations", {
      method: "POST",
      token: account.token,
      body: { proposed_count: 3, accepted_count: 1 },
      returnRows: true,
    });
    check(
      `insert generation as ${label} with accepted_count > 0 is rejected`,
      isClientError(preAccepted),
      `insert generation as ${label} with accepted_count 1 was accepted (${describe(preAccepted)})`,
    );
  }

  // No update grant: neither the owner nor anyone else can move the counters through REST.
  for (const [label, account, body] of [
    ["A", a, { accepted_count: 3 }],
    ["A", a, { proposed_count: 10 }],
    ["B", b, { accepted_count: 3 }],
    ["B", b, { proposed_count: 10 }],
  ]) {
    const [field] = Object.keys(body);
    const patch = await call(generationById, { method: "PATCH", token: account.token, body, returnRows: true });
    const after = await aGeneration();
    check(
      `update ${field} of A's generation as ${label} is rejected`,
      isClientError(patch) && after?.accepted_count === 0 && after?.proposed_count === 3,
      `update ${field} as ${label} was not rejected (${describe(patch)}, A's generation is now ${after?.accepted_count}/${after?.proposed_count})`,
    );
  }

  const acceptBody = { p_generation_id: generation.id, p_proposal_index: 0, p_front: front, p_back: back };
  const bAccept = await call("/rest/v1/rpc/accept_proposal", { method: "POST", token: b.token, body: acceptBody });
  const afterBAccept = await aGeneration();
  const aSlotAfterBAccept = await aSlotCards();
  const bCardsAfterBAccept = rowsOf(await call("/rest/v1/cards", { token: b.token })).length;
  check(
    "accept_proposal as B on A's generation is rejected and changes nothing",
    isGenerationNotFound(bAccept) &&
      afterBAccept?.accepted_count === 0 &&
      aSlotAfterBAccept === 0 &&
      bCardsAfterBAccept === 0,
    `accept_proposal as B was not rejected cleanly (${describe(bAccept)}, A's accepted_count ${afterBAccept?.accepted_count}, A's cards in the generation ${aSlotAfterBAccept}, B's cards ${bCardsAfterBAccept})`,
  );

  // Composite FK (generation_id, user_id): B cannot hang its own card on A's generation.
  const bLinkedCard = await call("/rest/v1/cards", {
    method: "POST",
    token: b.token,
    body: { front, back, generation_id: generation.id, proposal_index: 0 },
    returnRows: true,
  });
  const bCardsAfterLink = rowsOf(await call("/rest/v1/cards", { token: b.token })).length;
  check(
    "insert card as B with A's generation_id is rejected",
    isClientError(bLinkedCard) && bCardsAfterLink === 0 && (await aSlotCards()) === 0,
    `insert card as B with A's generation_id was accepted (${describe(bLinkedCard)}, B now has ${bCardsAfterLink} card(s))`,
  );

  const anonAccept = await call("/rest/v1/rpc/accept_proposal", { method: "POST", body: acceptBody });
  check(
    "accept_proposal as anon is rejected",
    isClientError(anonAccept) && (await aGeneration())?.accepted_count === 0,
    `accept_proposal as anon was not rejected (${describe(anonAccept)})`,
  );
  const anonGenerations = await call("/rest/v1/generations");
  check(
    "select generations as anon returns a permission error or zero rows",
    anonGenerations.status === 401 ||
      anonGenerations.status === 403 ||
      (anonGenerations.status === 200 && Array.isArray(anonGenerations.json) && anonGenerations.json.length === 0),
    `select generations as anon was neither denied nor empty (${describe(anonGenerations)})`,
  );

  // Positive path: the owner can accept, so the rejections above are not a broken function.
  const aAccept = await call("/rest/v1/rpc/accept_proposal", { method: "POST", token: a.token, body: acceptBody });
  const afterAAccept = await aGeneration();
  check(
    "accept_proposal as A saves the card and bumps A's counter",
    aAccept.ok &&
      rowsOf(aAccept)[0]?.created === true &&
      afterAAccept?.accepted_count === 1 &&
      (await aSlotCards()) === 1,
    `accept_proposal as A did not save the card (${describe(aAccept)}, A's accepted_count ${afterAAccept?.accepted_count})`,
  );

  console.log(failed ? `\n${failed} check(s) failed` : "\nAll isolation checks passed");
  console.log(`Throwaway accounts left in the local Supabase Auth: ${a.email}, ${b.email}`);
} catch (error) {
  abort(`unexpected error: ${error instanceof Error ? error.message : String(error)}`);
}

process.exit(failed ? 1 : 0);
