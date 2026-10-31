// Only completed matches between distinct ladder entrants may change ratings.
export type LadderResult = { first: string; second: string; winner: string | null; completed: boolean };

export function rateMatch(firstRating: number, secondRating: number, result: LadderResult): [number, number] {
  if (!result.completed || !result.first || !result.second || result.first === result.second ||
      !Number.isFinite(firstRating) || !Number.isFinite(secondRating) ||
      (result.winner !== null && result.winner !== result.first && result.winner !== result.second)) {
    throw new Error('无效的天梯对局结果');
  }
  const score = result.winner === null ? 0.5 : Number(result.winner === result.first);
  const expected = 1 / (1 + 10 ** ((secondRating - firstRating) / 400));
  const delta = 32 * (score - expected);
  return [firstRating + delta, secondRating - delta];
}
