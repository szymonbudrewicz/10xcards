import type { StepResult, ToolSet } from "ai";

// OpenRouter reports the billed cost per step when usage accounting is on; sum it over steps.
// undefined = the provider reported no cost for any step.
export function totalCost(steps: readonly StepResult<ToolSet>[]): number | undefined {
  let sum: number | undefined;
  for (const step of steps) {
    const openrouter = step.providerMetadata?.openrouter as { usage?: { cost?: number } } | undefined;
    const cost = openrouter?.usage?.cost;
    if (typeof cost === "number") sum = (sum ?? 0) + cost;
  }
  return sum;
}
