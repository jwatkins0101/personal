// Negative fixture for gate:commitments-dates: guesses dates from vague words.
export function resolveDue(quote: string | null | undefined, src: Date) {
  const d = new Date(src.getFullYear(), src.getMonth(), src.getDate() + 14);
  return { due_at: quote ? d.toISOString().slice(0, 10) : null, reason: "guessed" };
}
