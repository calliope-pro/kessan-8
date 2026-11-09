// 出題の種 (`?seed=N`)。N と、出題の回数 (`GameState.draws`) から、その回の乱数の種を決める。E2E も同じ式で「その枠が異変か」を求める。
export const drawSeed = (seed: number, draws: number): number => (seed + draws * 7919) >>> 0;
