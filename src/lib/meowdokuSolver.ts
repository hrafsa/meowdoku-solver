/**
 * Meowdoku / Star Battle Puzzle Solver Algorithm (Backtracking)
 * 
 * Rules:
 * 1. Exactly 1 cat per row
 * 2. Exactly 1 cat per column
 * 3. Exactly 1 cat per color region
 * 4. No adjacent cats (horizontal, vertical, or diagonal)
 * 5. Honors pre-placed cats on the board
 */

export interface Point {
  r: number; // row index (0-indexed)
  c: number; // column index (0-indexed)
}

export type Region = Point[];

export interface SolveResult {
  solved: boolean;
  cats: Point[];
  executionTimeMs: number;
}

export function solveMeowdoku(
  N: number,
  regions: Region[],
  prePlacedCats: Point[] = []
): SolveResult {
  const startTime = performance.now();

  // Create cell to region index lookup map
  const cellToRegionMap: Map<string, number> = new Map();
  regions.forEach((region, regionIndex) => {
    region.forEach(p => {
      cellToRegionMap.set(`${p.r},${p.c}`, regionIndex);
    });
  });

  const rowOccupied: boolean[] = new Array(N).fill(false);
  const colOccupied: boolean[] = new Array(N).fill(false);
  const regionOccupied: boolean[] = new Array(regions.length).fill(false);
  const placedCats: Point[] = [];

  // Enforce pre-placed cats
  for (const cat of prePlacedCats) {
    const regIdx = cellToRegionMap.get(`${cat.r},${cat.c}`);
    const conflicts = placedCats.some(placed =>
      Math.abs(placed.r - cat.r) <= 1 && Math.abs(placed.c - cat.c) <= 1
    );
    if (
      cat.r < 0 || cat.r >= N || cat.c < 0 || cat.c >= N ||
      regIdx === undefined || rowOccupied[cat.r] || colOccupied[cat.c] ||
      regionOccupied[regIdx] || conflicts
    ) {
      return { solved: false, cats: [], executionTimeMs: performance.now() - startTime };
    }
    rowOccupied[cat.r] = true;
    colOccupied[cat.c] = true;
    regionOccupied[regIdx] = true;
    placedCats.push(cat);
  }

  function isSafe(r: number, c: number): boolean {
    if (rowOccupied[r] || colOccupied[c]) return false;

    const regIdx = cellToRegionMap.get(`${r},${c}`);
    if (regIdx === undefined || regionOccupied[regIdx]) return false;

    // Check adjacent 8-neighbor constraint against already placed cats
    for (const cat of placedCats) {
      if (Math.abs(cat.r - r) <= 1 && Math.abs(cat.c - c) <= 1) {
        return false;
      }
    }

    return true;
  }

  function backtrack(r: number): boolean {
    if (r === N) {
      return true;
    }

    // If row r already has a pre-placed cat, skip to row r + 1
    if (rowOccupied[r]) {
      return backtrack(r + 1);
    }

    for (let c = 0; c < N; c++) {
      if (isSafe(r, c)) {
        const regIdx = cellToRegionMap.get(`${r},${c}`)!;
        colOccupied[c] = true;
        regionOccupied[regIdx] = true;
        placedCats.push({ r, c });

        if (backtrack(r + 1)) {
          return true;
        }

        placedCats.pop();
        colOccupied[c] = false;
        regionOccupied[regIdx] = false;
      }
    }

    return false;
  }

  const solved = backtrack(0);
  const executionTimeMs = performance.now() - startTime;

  return {
    solved,
    cats: solved ? placedCats : [],
    executionTimeMs,
  };
}
