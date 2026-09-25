// API prices in USD per million tokens, for the weekly cost estimate.
// Source: anthropic.com/pricing and model announcements (checked 2026-09-25). Update when prices change.

const PRICES: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/** Cost of one Claude call in USD, or undefined for a model without a known price. */
export function claudeCost(model: string, u: Usage | undefined): number | undefined {
  if (!u) return undefined;
  const key = Object.keys(PRICES).find((k) => model.startsWith(k));
  if (!key) return undefined;
  const p = PRICES[key];
  const input =
    (u.input_tokens ?? 0) + 1.25 * (u.cache_creation_input_tokens ?? 0) + 0.1 * (u.cache_read_input_tokens ?? 0);
  return (input * p.input + (u.output_tokens ?? 0) * p.output) / 1_000_000;
}

export function usd(v: number): string {
  return v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`;
}
