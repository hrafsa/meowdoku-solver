/**
 * Computer Vision Engine for Meowdoku Grid & Color Region Detection
 * Includes Screen State Classifier with Clean Popup Visualizer Suppression
 */

import { Point, Region, solveMeowdoku, SolveResult } from './meowdokuSolver';

export const STD_WIDTH = 720;
export const STD_HEIGHT = 1600;

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export type ScreenState = 'GAME_BOARD' | 'SCOREBOARD' | 'VICTORY_SCREEN' | 'UNKNOWN';

export interface GridDetectionResult {
  N: number;
  rowCenters: number[];
  colCenters: number[];
  scaleX: number;
  scaleY: number;
  origW: number;
  origH: number;
  regions: Region[];
  gridColors: RGB[][];
  solution?: Point[];
  screenState?: ScreenState;
}

export function colorDistance(c1: RGB, c2: RGB): number {
  return Math.sqrt(
    Math.pow(c1.r - c2.r, 2) +
    Math.pow(c1.g - c2.g, 2) +
    Math.pow(c1.b - c2.b, 2)
  );
}

/**
 * Samples single pixel RGB from Canvas ImageData
 */
export function samplePixelRGB(imageData: ImageData, x: number, y: number): RGB {
  const { width, height, data } = imageData;
  const px = Math.min(Math.max(0, Math.round(x)), width - 1);
  const py = Math.min(Math.max(0, Math.round(y)), height - 1);
  const idx = (py * width + px) * 4;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
  };
}

/**
 * AUTOMATIC SCREEN STATE CLASSIFIER
 * Detects SCOREBOARD ("Papan Peringkat"), VICTORY_SCREEN, or GAME_BOARD
 */
export function detectScreenState(stdImageData: ImageData): ScreenState {
  // 1. Check for Big Orange "Level XXX" Next Level Button at (360, 1320)
  const victoryBtnColor = samplePixelRGB(stdImageData, 360, 1320);
  if (
    victoryBtnColor.r > 210 &&
    victoryBtnColor.g > 110 &&
    victoryBtnColor.g < 175 &&
    victoryBtnColor.b < 80
  ) {
    return 'VICTORY_SCREEN';
  }

  // 2. Check for Scoreboard Background Dimming ("Papan Peringkat")
  // Measure outer margin brightness (top-left margin, top-right margin)
  const topLeftMargin = samplePixelRGB(stdImageData, 50, 200);
  const topRightMargin = samplePixelRGB(stdImageData, 670, 200);
  const avgMarginBrightness =
    (topLeftMargin.r + topLeftMargin.g + topLeftMargin.b +
     topRightMargin.r + topRightMargin.g + topRightMargin.b) / 6;

  // When Scoreboard modal popup is active, outer margin brightness drops significantly (< 185)
  if (avgMarginBrightness < 185) {
    return 'SCOREBOARD';
  }

  return 'GAME_BOARD';
}

/**
 * Calculates pixel-accurate grid tile center coordinates for candidate N
 */
export function getGridCentersForN(N: number): { colCenters: number[]; rowCenters: number[] } {
  const boardSize = 672.0;
  const xStart = 24.0;
  const yStart = 473.3;

  const step = boardSize / N;
  const halfStep = step / 2.0;

  const colCenters: number[] = [];
  const rowCenters: number[] = [];

  for (let c = 0; c < N; c++) {
    colCenters.push(Math.round(xStart + c * step + halfStep));
  }

  for (let r = 0; r < N; r++) {
    rowCenters.push(Math.round(yStart + r * step + halfStep));
  }

  return { colCenters, rowCenters };
}

/**
 * Extracts color regions for candidate size N
 */
export function extractRegionsForN(
  stdImageData: ImageData,
  N: number,
  colCenters: number[],
  rowCenters: number[],
  tolerance: number = 28.0
): { regions: Region[]; gridColors: RGB[][] } {
  const gridColors: RGB[][] = [];
  const flatColors: RGB[] = [];

  for (let r = 0; r < N; r++) {
    const row: RGB[] = [];
    for (let c = 0; c < N; c++) {
      const color = samplePixelRGB(stdImageData, colCenters[c], rowCenters[r]);
      row.push(color);
      flatColors.push(color);
    }
    gridColors.push(row);
  }

  const regionCenters: RGB[] = [];
  const regionMap: number[] = new Array(N * N).fill(-1);

  for (let idx = 0; idx < flatColors.length; idx++) {
    const color = flatColors[idx];
    let matchedRegion = -1;

    for (let regIdx = 0; regIdx < regionCenters.length; regIdx++) {
      if (colorDistance(color, regionCenters[regIdx]) <= tolerance) {
        matchedRegion = regIdx;
        break;
      }
    }

    if (matchedRegion !== -1) {
      regionMap[idx] = matchedRegion;
    } else {
      if (regionCenters.length < N) {
        regionCenters.push(color);
        regionMap[idx] = regionCenters.length - 1;
      } else {
        let minDistance = Infinity;
        let closestRegion = 0;
        for (let regIdx = 0; regIdx < regionCenters.length; regIdx++) {
          const dist = colorDistance(color, regionCenters[regIdx]);
          if (dist < minDistance) {
            minDistance = dist;
            closestRegion = regIdx;
          }
        }
        regionMap[idx] = closestRegion;
      }
    }
  }

  const regions: Region[] = [];
  for (let regIdx = 0; regIdx < N; regIdx++) {
    const cells: Point[] = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const flatIdx = r * N + c;
        if (regionMap[flatIdx] === regIdx) {
          cells.push({ r, c });
        }
      }
    }
    regions.push(cells);
  }

  return { regions, gridColors };
}

/**
 * 100% AUTOMATIC PIPELINE:
 * Detects Screen State (GAME_BOARD, SCOREBOARD, VICTORY_SCREEN)
 * Tests candidate grid sizes N in priority order (10, 8, 9, 6, 7)
 */
export function processImageDataAuto(
  stdImageData: ImageData,
  origW: number = 1080,
  origH: number = 2400
): GridDetectionResult {
  const scaleX = origW / STD_WIDTH;
  const scaleY = origH / STD_HEIGHT;

  // 1. Detect Screen State
  const screenState = detectScreenState(stdImageData);

  // If Pop-up active (SCOREBOARD or VICTORY_SCREEN), return early without fake grid overlays
  if (screenState === 'SCOREBOARD' || screenState === 'VICTORY_SCREEN') {
    return {
      N: 0,
      rowCenters: [],
      colCenters: [],
      scaleX,
      scaleY,
      origW,
      origH,
      regions: [],
      gridColors: [],
      screenState,
    };
  }

  // Candidate grid sizes in descending priority order: 10x10, 9x9, 8x8, 7x7, 6x6
  const candidateNs = [10, 9, 8, 7, 6];

  for (const N of candidateNs) {
    const grid = getGridCentersForN(N);
    const extracted = extractRegionsForN(
      stdImageData,
      N,
      grid.colCenters,
      grid.rowCenters,
      28.0
    );

    const solution = solveMeowdoku(N, extracted.regions);
    if (solution.solved && solution.cats.length === N) {
      // PERFECT SOLVER MATCH FOUND FOR SIZE N!
      return {
        N,
        rowCenters: grid.rowCenters,
        colCenters: grid.colCenters,
        scaleX,
        scaleY,
        origW,
        origH,
        regions: extracted.regions,
        gridColors: extracted.gridColors,
        solution: solution.cats,
        screenState: 'GAME_BOARD',
      };
    }
  }

  // Fallback to 10x10
  const fallbackGrid = getGridCentersForN(10);
  const fallbackExtracted = extractRegionsForN(
    stdImageData,
    10,
    fallbackGrid.colCenters,
    fallbackGrid.rowCenters,
    28.0
  );

  return {
    N: 10,
    rowCenters: fallbackGrid.rowCenters,
    colCenters: fallbackGrid.colCenters,
    scaleX,
    scaleY,
    origW,
    origH,
    regions: fallbackExtracted.regions,
    gridColors: fallbackExtracted.gridColors,
    screenState: 'GAME_BOARD',
  };
}
