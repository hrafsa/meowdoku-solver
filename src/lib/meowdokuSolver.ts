/**
 * Meowdoku / Star Battle Puzzle Solver Algorithm (Backtracking)
 * 
 * Rules:
 * 1. Exactly 1 cat per row
 * 2. Exactly 1 cat per column
 * 3. Exactly 1 cat per color region
 * 4. No adjacent cats (horizontal, vertical, or diagonal)
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

export function solveMeowdoku(N: number, regions: Region[]): SolveResult {
  const startTime = performance.now();

  // Create cell to region index lookup map
  const cellToRegionMap: Map<string, number> = new Map();
  regions.forEach((region, regionIndex) => {
    region.forEach(p => {
      cellToRegionMap.set(`${p.r},${p.c}`, regionIndex);
    });
  });

  const colOccupied: boolean[] = new Array(N).fill(false);
  const regionOccupied: boolean[] = new Array(regions.length).fill(false);
  const placedCats: Point[] = [];

  function isSafe(r: number, c: number): boolean {
    // Check column constraint
    if (colOccupied[c]) {
      return false;
    }

    // Check region constraint
    const regIdx = cellToRegionMap.get(`${r},${c}`);
    if (regIdx === undefined || regionOccupied[regIdx]) {
      return false;
    }

    // Check adjacency constraint (no cat within 1 cell in any direction)
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

    for (let c = 0; c < N; c++) {
      if (isSafe(r, c)) {
        const regIdx = cellToRegionMap.get(`${r},${c}`)!;

        // Place cat
        colOccupied[c] = true;
        regionOccupied[regIdx] = true;
        placedCats.push({ r, c });

        if (backtrack(r + 1)) {
          return true;
        }

        // Backtrack
        placedCats.pop();
        regionOccupied[regIdx] = false;
        colOccupied[c] = false;
      }
    }

    return false;
  }

  const solved = backtrack(0);
  const endTime = performance.now();

  if (solved) {
    // Sort cats by row index
    placedCats.sort((a, b) => a.r - b.r);
  }

  return {
    solved,
    cats: solved ? placedCats : [],
    executionTimeMs: Number((endTime - startTime).toFixed(2)),
  };
}
