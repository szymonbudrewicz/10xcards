// Output contract of the code-review agent (M5L2, M5L3): six 10xCards criteria, each
// scored 1-10 with a one-sentence reason, a binding verdict and a summary. The agent,
// the CLI, the PR comment, the CI gate and the promptfoo evals read this one definition.
// Prompts live in src/prompts/; the verdict rule lives in src/verdict.ts.
import { z } from "zod";

// Scores are plain z.number(): Anthropic structured output rejects minimum/maximum on
// integer types, so the 1-10 range is carried by the field description and the prompt.
function criterion(name: string, low: string, high: string) {
  return z
    .object({
      score: z.number().describe(`Ocena 1-10. 1: ${low} 10: ${high}`),
      reason: z.string().describe("Jedno zdanie uzasadnienia; przy ocenie < 7 wskaż konkretny plik lub linię"),
    })
    .describe(name);
}

export const CRITERIA = {
  implementationCorrectness: criterion(
    "Poprawność i kontrakt API",
    "logika błędna, pominięte przypadki brzegowe (puste wejście, brak rekordu, błąd Supabase/modelu), " +
      "cicha zmiana istniejącego zachowania, błędy w innym kształcie niż { error: { code, message } } albo z mylącym statusem HTTP.",
    "ścieżka główna, przypadki brzegowe i obsługa błędów poprawne; wejście walidowane; " +
      "kod błędu w snake_case, komunikat po polsku; brak regresji.",
  ),
  accountIsolation: criterion(
    "Izolacja kont i dostęp do danych (twarda reguła)",
    "nowa tabela bez RLS albo z jedną szeroką polityką; user_id z body/parametru; szersze grants na kolumnach niż potrzeba; " +
      "brak sprawdzenia null z createClient(); nowa chroniona strona poza PROTECTED_ROUTES; jedno konto może czytać lub zmieniać dane innego.",
    "osobne polityki RLS na każdą operację i rolę; tożsamość wyłącznie z sesji; minimalne uprawnienia; ścieżki bez auth obsłużone jawnie.",
  ),
  privacySecretsAiCost: criterion(
    "Prywatność, sekrety i koszt AI (twarda reguła)",
    "wklejony tekst użytkownika zapisywany lub logowany (także console.* i treść błędów); sekret/klucz w kodzie lub w .dev.vars; " +
      "limit generowania do obejścia; wywołania modelu bez ograniczeń.",
    "trwałe są tylko fiszki i liczniki; sekrety we właściwych plikach env; wywołania AI mają limit i sensowną obsługę porażki.",
  ),
  projectConventions: criterion(
    "Zgodność z konwencjami 10xCards",
    'React tam, gdzie wystarczy Astro; "use client"; sklejanie klas zamiast cn(); palety/hex/arbitrary zamiast ról tokenów; ' +
      "nowy komponent zamiast istniejącego z src/components/ui/; pakiet radix-ui; logika biznesowa poza src/lib/services/, typy poza src/types.ts; " +
      "zła nazwa migracji; zmiany w context/archive/; zmiana architektury bez aktualizacji CLAUDE.md.",
    "nie do odróżnienia od dobrze napisanego kodu wokół; dokumentacja zaktualizowana tam, gdzie trzeba.",
  ),
  simplicityAndScope: criterion(
    "Prostota i zakres zmiany",
    "niepotrzebne abstrakcje, martwy kod, `any` dla wygody; PR miesza kilka niezależnych zmian; opis PR-a nie mówi, co i dlaczego się zmienia.",
    "najprostsze rozwiązanie, które w pełni rozwiązuje problem; jedna spójna zmiana; opis wskazuje cel " +
      "(najlepiej z odwołaniem do context/changes/<id>/).",
  ),
  testRiskCoverage: criterion(
    "Testy proporcjonalne do ryzyka",
    "ryzykowna logika (endpoint, RLS, liczniki, granica AI) bez testów; testy niczego nie sprawdzają, leżą w src/pages/ albo wołają prawdziwą sieć.",
    "najbardziej ryzykowne ścieżki mają celowe testy w tests/; granica AI stubowana przez fetch; " +
      "zmiany w bazie pokryte testami integracyjnymi; prostych zmian nie testujemy na siłę.",
  ),
};

export type CriterionKey = keyof typeof CRITERIA;
export const CRITERION_KEYS = Object.keys(CRITERIA) as CriterionKey[];
// Criteria 2 and 3: a low score here fails the PR on its own (src/verdict.ts).
export const HARD_CRITERIA: readonly CriterionKey[] = ["accountIsolation", "privacySecretsAiCost"];

export const REVIEW_SCHEMA = z.object({
  ...CRITERIA,
  verdict: z
    .enum(["pass", "fail"])
    .describe("Wiążący werdykt: fail, gdy kryterium 2 lub 3 ma ocenę <= 4 albo dowolne kryterium <= 3; inaczej pass"),
  summary: z
    .string()
    .describe("Podsumowanie w Markdown dla autora PR-a; każda ocena < 7 wskazuje konkretny plik lub linię"),
});

// draft-07 keeps zod output compatible with the Claude Agent SDK outputFormat.
export const REVIEW_JSON_SCHEMA = z.toJSONSchema(REVIEW_SCHEMA, { target: "draft-07" });

export type Review = z.infer<typeof REVIEW_SCHEMA>;
export type Verdict = Review["verdict"];
