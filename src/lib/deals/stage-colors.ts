/** Barva fáze podle pořadí: indigová progrese (čím dál je deal, tím sytější). Tokeny --stage-1 … --stage-5 mění barvy podle tématu. */
export function stageColor(index: number, total: number): string {
  const n = total <= 1 ? 1 : Math.round((index * 4) / (total - 1)) + 1;
  return `var(--stage-${Math.min(5, Math.max(1, n))})`;
}
