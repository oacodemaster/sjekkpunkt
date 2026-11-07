// Second, deterministic layer against prompt injection (brief section 6, R8).
// The first layer is the vision prompt plus the model's `containsInstructions` flag.

const INSTRUCTION_PATTERN =
  /(ignor|godkjenn|approve|refund|refusjon|override|overstyr|system|instruks|assistant|\b\d{3,}\s?(kr|nok)\b)/i;

export function detectInstructions(text: string | null | undefined): boolean {
  if (!text) return false;
  return INSTRUCTION_PATTERN.test(text);
}
