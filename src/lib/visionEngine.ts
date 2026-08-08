/**
 * Resolution-independent computer vision for Meowdoku.
 *
 * Important: all coordinates in this module are native screenshot coordinates.
 * The image must not be stretched to a fixed aspect ratio before it gets here.
 */

import { Point, Region, solveMeowdoku } from './meowdokuSolver';

// Kept for API compatibility. The native pipeline no longer resizes to these values.
export const STD_WIDTH = 720;
export const STD_HEIGHT = 1600;

export interface RGB {
  r: number;
  g: number;
  b: number;
}

interface Lab {
  l: number;
  a: number;
  b: number;
}

export type ScreenState = 'GAME_BOARD' | 'SCOREBOARD' | 'VICTORY_SCREEN' | 'UNKNOWN';

export interface BoardBox {
  xStart: number;
  yStart: number;
  boardWidth: number;
  boardHeight: number;
  confidence: number;
}

export interface DetectionDiagnostics {
  boardConfidence: number;
  gridConfidence: number;
  regionConfidence: number;
  message?: string;
}

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
  prePlacedCats?: Point[];
  solution?: Point[];
  screenState?: ScreenState;
  boardBox?: BoardBox;
  confidence?: number;
  diagnostics?: DetectionDiagnostics;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const brightness = (color: RGB) =>
  color.r * 0.299 + color.g * 0.587 + color.b * 0.114;

const isDark = (color: RGB) => brightness(color) < 95;

// The real game uses coloured rounded tiles separated by white gutters.
// Accepts vivid and muted pastel tiles while rejecting off-white page background.
const isGridColor = (color: RGB) => {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const b = brightness(color);
  return (max - min >= 6 || b < 225) && b >= 35 && b <= 238;
};

export function colorDistance(c1: RGB, c2: RGB): number {
  const p1 = rgbToLab(c1);
  const p2 = rgbToLab(c2);
  return Math.hypot(p1.l - p2.l, p1.a - p2.a, p1.b - p2.b);
}

export function samplePixelRGB(imageData: ImageData, x: number, y: number): RGB {
  const { width, height, data } = imageData;
  const px = clamp(Math.round(x), 0, width - 1);
  const py = clamp(Math.round(y), 0, height - 1);
  const idx = (py * width + px) * 4;
  return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
}

function rgbToLab(color: RGB): Lab {
  const linear = (v: number) => {
    const n = v / 255;
    return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  const r = linear(color.r);
  const g = linear(color.g);
  const b = linear(color.b);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (v: number) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  return { l: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function medianColor(colors: RGB[]): RGB {
  if (!colors.length) return { r: 0, g: 0, b: 0 };
  return {
    r: Math.round(median(colors.map(c => c.r))),
    g: Math.round(median(colors.map(c => c.g))),
    b: Math.round(median(colors.map(c => c.b))),
  };
}

function darkFractionHorizontal(image: ImageData, y: number, x1: number, x2: number): number {
  const step = Math.max(1, Math.floor((x2 - x1) / 240));
  let dark = 0;
  let count = 0;
  for (let x = x1; x <= x2; x += step) {
    if (isDark(samplePixelRGB(image, x, y))) dark++;
    count++;
  }
  return count ? dark / count : 0;
}

function darkFractionVertical(image: ImageData, x: number, y1: number, y2: number): number {
  const step = Math.max(1, Math.floor((y2 - y1) / 240));
  let dark = 0;
  let count = 0;
  for (let y = y1; y <= y2; y += step) {
    if (isDark(samplePixelRGB(image, x, y))) dark++;
    count++;
  }
  return count ? dark / count : 0;
}

function bestDarkBand(
  image: ImageData,
  orientation: 'horizontal' | 'vertical',
  position: number,
  from: number,
  to: number,
  radius: number,
): number {
  let best = 0;
  for (let d = -radius; d <= radius; d++) {
    best = Math.max(best, orientation === 'horizontal'
      ? darkFractionHorizontal(image, position + d, from, to)
      : darkFractionVertical(image, position + d, from, to));
  }
  return best;
}

function findColorGridBox(image: ImageData): BoardBox | null {
  const { width: w, height: h } = image;
  const xFrom = Math.round(w * 0.015);
  const xTo = Math.round(w * 0.985);
  const yFrom = Math.round(h * 0.14);
  const yTo = Math.round(h * 0.76);
  const pixelStep = Math.max(1, Math.round(w / 360));
  const rowStep = Math.max(1, Math.round(h / 900));
  const activeRows: { y: number; coverage: number }[] = [];

  for (let y = yFrom; y <= yTo; y += rowStep) {
    let coloured = 0;
    let total = 0;
    for (let x = xFrom; x <= xTo; x += pixelStep) {
      if (isGridColor(samplePixelRGB(image, x, y))) coloured++;
      total++;
    }
    const coverage = coloured / Math.max(1, total);
    if (coverage >= 0.34) activeRows.push({ y, coverage });
  }
  if (!activeRows.length) return null;

  const maxGap = Math.max(rowStep * 3, Math.round(w * 0.025));
  const groups: typeof activeRows[] = [];
  for (const row of activeRows) {
    const current = groups[groups.length - 1];
    if (!current || row.y - current[current.length - 1].y > maxGap) groups.push([row]);
    else current.push(row);
  }

  let best: BoardBox | null = null;
  let bestScore = -Infinity;
  for (const group of groups) {
    const yStart = group[0].y;
    const yEnd = group[group.length - 1].y;
    const colouredHeight = yEnd - yStart + rowStep;
    if (colouredHeight < w * 0.55 || colouredHeight > w * 1.12) continue;

    const xProfile: { x: number; coverage: number }[] = [];
    for (let x = xFrom; x <= xTo; x += pixelStep) {
      let coloured = 0;
      let total = 0;
      for (let y = yStart; y <= yEnd; y += rowStep) {
        if (isGridColor(samplePixelRGB(image, x, y))) coloured++;
        total++;
      }
      xProfile.push({ x, coverage: coloured / Math.max(1, total) });
    }
    const activeX = xProfile.filter(p => p.coverage >= 0.34);
    if (!activeX.length) continue;
    const xStart = activeX[0].x;
    const xEnd = activeX[activeX.length - 1].x;
    const colouredWidth = xEnd - xStart + pixelStep;
    const aspect = Math.min(colouredWidth, colouredHeight) / Math.max(colouredWidth, colouredHeight);
    if (colouredWidth < w * 0.60 || aspect < 0.80) continue;

    const density = group.reduce((sum, row) => sum + row.coverage, 0) / group.length;
    const confidence = clamp(aspect * 0.55 + density * 0.45, 0, 1);
    const score = confidence + colouredWidth / w * 0.12;
    if (score > bestScore) {
      bestScore = score;
      best = {
        xStart,
        yStart,
        boardWidth: colouredWidth,
        boardHeight: colouredHeight,
        confidence,
      };
    }
  }
  return best;
}

function findDarkBorderBox(image: ImageData): BoardBox | null {
  const { width: w, height: h } = image;
  if (w < 200 || h < 300) return null;

  // The board is nearly screen-wide. Test several widths to tolerate tablets,
  // cut-outs, display scaling, and different game versions.
  const widthRatios = [0.94, 0.92, 0.90, 0.96, 0.88, 0.84, 0.80, 0.76, 0.72];
  const yMin = Math.round(h * 0.16);
  const yMax = Math.round(Math.min(h * 0.72, h - w * 0.70));
  const yStep = Math.max(2, Math.round(h / 700));
  let best: BoardBox | null = null;
  let bestScore = -Infinity;

  for (const ratio of widthRatios) {
    const size = Math.round(w * ratio);
    const x = Math.round((w - size) / 2);
    const radius = Math.max(2, Math.round(size * 0.006));
    for (let y = yMin; y <= yMax; y += yStep) {
      if (y + size >= h) continue;
      const top = bestDarkBand(image, 'horizontal', y, x, x + size, radius);
      if (top < 0.55) continue;
      const bottom = bestDarkBand(image, 'horizontal', y + size, x, x + size, radius);
      const left = bestDarkBand(image, 'vertical', x, y, y + size, radius);
      const right = bestDarkBand(image, 'vertical', x + size, y, y + size, radius);
      const borderScore = (top + bottom + left + right) / 4;
      const squarePrior = 1 - Math.abs(ratio - 0.92) * 0.35;
      const score = borderScore * squarePrior;
      if (score > bestScore) {
        bestScore = score;
        best = { xStart: x, yStart: y, boardWidth: size, boardHeight: size, confidence: borderScore };
      }
    }
  }

  return best && best.confidence >= 0.32 ? best : null;
}

/** Finds either the real coloured-tile matrix or a dark-bordered board variant. */
export function findBoardBox(image: ImageData): BoardBox | null {
  return findColorGridBox(image) || findDarkBorderBox(image);
}

export function getGridCentersForN(N: number, box: BoardBox) {
  const stepX = box.boardWidth / N;
  const stepY = box.boardHeight / N;
  return {
    colCenters: Array.from({ length: N }, (_, c) => box.xStart + (c + 0.5) * stepX),
    rowCenters: Array.from({ length: N }, (_, r) => box.yStart + (r + 0.5) * stepY),
  };
}

function gridLineScore(image: ImageData, box: BoardBox, N: number): number {
  const radius = Math.max(1, Math.round(box.boardWidth * 0.0035));
  const inset = Math.round(box.boardWidth * 0.015);
  const scores: number[] = [];
  for (let i = 1; i < N; i++) {
    const x = box.xStart + box.boardWidth * i / N;
    const y = box.yStart + box.boardHeight * i / N;
    scores.push(bestDarkBand(image, 'vertical', x, box.yStart + inset, box.yStart + box.boardHeight - inset, radius));
    scores.push(bestDarkBand(image, 'horizontal', y, box.xStart + inset, box.xStart + box.boardWidth - inset, radius));
  }
  return median(scores);
}

/** Detect N from equally-spaced grid separators, independent of header font/text. */
interface ProfileBand {
  center: number;
  width: number;
}

function colouredBands(
  image: ImageData,
  box: BoardBox,
  orientation: 'columns' | 'rows',
): ProfileBand[] {
  const length = orientation === 'columns' ? box.boardWidth : box.boardHeight;
  const crossLength = orientation === 'columns' ? box.boardHeight : box.boardWidth;
  const sampleStep = Math.max(1, Math.round(length / 500));
  const crossStep = Math.max(1, Math.round(crossLength / 180));
  const active: number[] = [];

  for (let offset = 0; offset <= length; offset += sampleStep) {
    let coloured = 0;
    let total = 0;
    for (let cross = 0; cross <= crossLength; cross += crossStep) {
      const x = orientation === 'columns' ? box.xStart + offset : box.xStart + cross;
      const y = orientation === 'columns' ? box.yStart + cross : box.yStart + offset;
      if (isGridColor(samplePixelRGB(image, x, y))) coloured++;
      total++;
    }
    if (coloured / Math.max(1, total) >= 0.42) active.push(offset);
  }

  const bands: ProfileBand[] = [];
  for (const value of active) {
    const current = bands[bands.length - 1];
    if (!current || value - (current.center + current.width / 2) > sampleStep * 1.5) {
      bands.push({ center: value, width: sampleStep });
    } else {
      const start = current.center - current.width / 2;
      const end = value + sampleStep / 2;
      current.center = (start + end) / 2;
      current.width = end - start;
    }
  }
  return bands.filter(band => band.width >= length * 0.035);
}

function bandRegularity(bands: ProfileBand[]): number {
  if (bands.length < 2) return 0;
  const gaps = bands.slice(1).map((band, i) => band.center - bands[i].center);
  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  const deviation = Math.sqrt(gaps.reduce((sum, gap) => sum + Math.pow(gap - mean, 2), 0) / gaps.length);
  return clamp(1 - deviation / Math.max(1, mean) * 3, 0, 1);
}

export function detectGridSize(
  image: ImageData,
  box: BoardBox,
): { N: number; confidence: number; colCenters?: number[]; rowCenters?: number[] } | null {
  const columnBands = colouredBands(image, box, 'columns');
  const rowBands = colouredBands(image, box, 'rows');
  const validColumns = columnBands.length >= 5 && columnBands.length <= 10;
  const validRows = rowBands.length >= 5 && rowBands.length <= 10;

  if (validColumns && validRows && columnBands.length === rowBands.length) {
    const confidence = (bandRegularity(columnBands) + bandRegularity(rowBands)) / 2;
    if (confidence >= 0.35) {
      return {
        N: columnBands.length,
        confidence,
        colCenters: columnBands.map(band => box.xStart + band.center),
        rowCenters: rowBands.map(band => box.yStart + band.center),
      };
    }
  }

  const ranked = [10, 9, 8, 7, 6, 5]
    .map(N => ({ N, confidence: gridLineScore(image, box, N) }))
    .sort((a, b) => b.confidence - a.confidence);
  const best = ranked[0];
  const confidence = Math.max(0.50, best.confidence);
  return { N: best.N, confidence };
}

function sampleCellBackground(image: ImageData, cx: number, cy: number, step: number): RGB {
  const colors: RGB[] = [];
  // Dense symmetric samples avoid grid borders and survive icons/cats in the centre.
  const offsets = [-0.28, -0.16, 0.16, 0.28];
  for (const oy of offsets) {
    for (const ox of offsets) {
      const color = samplePixelRGB(image, cx + ox * step, cy + oy * step);
      if (brightness(color) > 45) colors.push(color);
    }
  }
  return medianColor(colors);
}

function hasCatAtCenter(image: ImageData, cx: number, cy: number, step: number): boolean {
  let dark = 0;
  let total = 0;
  const radius = step * 0.22;
  for (let gy = -3; gy <= 3; gy++) {
    for (let gx = -3; gx <= 3; gx++) {
      if (gx * gx + gy * gy > 10) continue;
      const color = samplePixelRGB(image, cx + gx * radius / 3, cy + gy * radius / 3);
      if (brightness(color) < 58) dark++;
      total++;
    }
  }
  return total > 0 && dark / total >= 0.20;
}

interface Edge {
  a: number;
  b: number;
  weight: number;
}

class DisjointSet {
  private parent: number[];
  private rank: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
    this.rank = new Array(size).fill(0);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a: number, b: number): boolean {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    if (this.rank[ra] === this.rank[rb]) this.rank[ra]++;
    return true;
  }
}

/**
 * Creates exactly N contiguous regions with a minimum spanning forest. The
 * N-1 strongest perceptual color boundaries are retained instead of merging
 * arbitrary components until the count happens to match.
 */
export function extractRegionsForN(
  image: ImageData,
  N: number,
  colCenters: number[],
  rowCenters: number[],
  box: BoardBox,
): { regions: Region[]; gridColors: RGB[][]; prePlacedCats: Point[]; confidence: number } {
  const step = Math.min(box.boardWidth, box.boardHeight) / N;
  const gridColors: RGB[][] = [];
  const prePlacedCats: Point[] = [];
  for (let r = 0; r < N; r++) {
    const row: RGB[] = [];
    for (let c = 0; c < N; c++) {
      row.push(sampleCellBackground(image, colCenters[c], rowCenters[r], step));
      if (hasCatAtCenter(image, colCenters[c], rowCenters[r], step)) prePlacedCats.push({ r, c });
    }
    gridColors.push(row);
  }

  const edges: Edge[] = [];
  const idx = (r: number, c: number) => r * N + c;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (r + 1 < N) edges.push({ a: idx(r, c), b: idx(r + 1, c), weight: colorDistance(gridColors[r][c], gridColors[r + 1][c]) });
      if (c + 1 < N) edges.push({ a: idx(r, c), b: idx(r, c + 1), weight: colorDistance(gridColors[r][c], gridColors[r][c + 1]) });
    }
  }
  edges.sort((a, b) => a.weight - b.weight);

  const dsu = new DisjointSet(N * N);
  const accepted: Edge[] = [];
  // A forest of N*N nodes and N components contains N*N-N edges.
  for (const edge of edges) {
    if (accepted.length >= N * N - N) break;
    if (dsu.union(edge.a, edge.b)) accepted.push(edge);
  }

  const groups = new Map<number, Region>();
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const root = dsu.find(idx(r, c));
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root)!.push({ r, c });
    }
  }
  const regions = [...groups.values()];

  const maxInside = accepted.length ? Math.max(...accepted.map(e => e.weight)) : 0;
  const outside = edges.filter(e => dsu.find(e.a) !== dsu.find(e.b)).map(e => e.weight);
  const minBoundary = outside.length ? Math.min(...outside) : 0;
  const colorSeparation = minBoundary / Math.max(1, maxInside);
  const confidence = clamp((colorSeparation - 0.75) / 1.5, 0, 1);
  return { regions, gridColors, prePlacedCats, confidence };
}

function hasLargeOrangeButton(image: ImageData): boolean {
  const { width: w, height: h } = image;
  const step = Math.max(2, Math.round(w / 240));
  let consecutiveWideRows = 0;
  let maxConsecutiveWideRows = 0;
  for (let y = Math.round(h * 0.58); y < Math.round(h * 0.94); y += step) {
    let longestRun = 0;
    let currentRun = 0;
    for (let x = Math.round(w * 0.05); x < Math.round(w * 0.95); x += step) {
      const c = samplePixelRGB(image, x, y);
      const orange = c.r > 185 && c.r > c.g * 1.22 && c.g > 70 && c.b < 120;
      currentRun = orange ? currentRun + step : 0;
      longestRun = Math.max(longestRun, currentRun);
    }
    if (longestRun >= w * 0.34) consecutiveWideRows += step;
    else consecutiveWideRows = 0;
    maxConsecutiveWideRows = Math.max(maxConsecutiveWideRows, consecutiveWideRows);
  }
  return maxConsecutiveWideRows >= h * 0.022;
}

function isScoreboardModal(image: ImageData): boolean {
  const { width: w, height: h } = image;

  // 1. Check outer background margins (left/right of screen)
  // On normal active game board, page background is off-white (brightness > 200).
  // On Papan Peringkat popup, modal overlay dims outer margins to dark (brightness < 165).
  const leftMargin = samplePixelRGB(image, w * 0.03, h * 0.50);
  const rightMargin = samplePixelRGB(image, w * 0.97, h * 0.50);
  const marginBrightness = (brightness(leftMargin) + brightness(rightMargin)) / 2;

  // If outer margins are bright off-white, it is NEVER a modal popup!
  if (marginBrightness > 195) {
    return false;
  }

  const yStep = Math.max(2, Math.round(h * 0.005));
  const xStep = Math.max(4, Math.round(w * 0.015));

  // 2. Check for "Ketuk untuk melanjutkan" yellow text at bottom (Y in [0.83 * h, 0.94 * h])
  let yellowTextCount = 0;
  for (let y = Math.round(h * 0.83); y <= Math.round(h * 0.94); y += yStep) {
    for (let x = Math.round(w * 0.22); x <= Math.round(w * 0.78); x += xStep) {
      const c = samplePixelRGB(image, x, y);
      if (c.r > 190 && c.g > 150 && c.r > c.b + 45 && c.b < 140) {
        yellowTextCount++;
      }
    }
  }

  // 3. Check for "Papan Peringkat" orange header title text at top (Y in [0.15 * h, 0.27 * h])
  let orangeTitleCount = 0;
  for (let y = Math.round(h * 0.15); y <= Math.round(h * 0.27); y += yStep) {
    for (let x = Math.round(w * 0.20); x <= Math.round(w * 0.80); x += xStep) {
      const c = samplePixelRGB(image, x, y);
      if (c.r > 190 && c.g > 100 && c.g < 190 && c.b < 100 && c.r > c.b + 60) {
        orangeTitleCount++;
      }
    }
  }

  return yellowTextCount >= 4 || orangeTitleCount >= 6;
}

export function detectScreenState(image: ImageData, board?: BoardBox | null): ScreenState {
  if (isScoreboardModal(image)) return 'SCOREBOARD';
  if (hasLargeOrangeButton(image)) return 'VICTORY_SCREEN';
  if (board) return 'GAME_BOARD';
  return 'UNKNOWN';
}

function emptyResult(image: ImageData, state: ScreenState, message: string): GridDetectionResult {
  return {
    N: 0,
    rowCenters: [],
    colCenters: [],
    scaleX: 1,
    scaleY: 1,
    origW: image.width,
    origH: image.height,
    regions: [],
    gridColors: [],
    screenState: state,
    confidence: 0,
    diagnostics: { boardConfidence: 0, gridConfidence: 0, regionConfidence: 0, message },
  };
}

export function processImageDataAuto(
  image: ImageData,
  origW: number = image.width,
  origH: number = image.height,
): GridDetectionResult {
  const modalState = detectScreenState(image, null);
  if (modalState === 'SCOREBOARD' || modalState === 'VICTORY_SCREEN') {
    return emptyResult(image, modalState, `Modal popup active: ${modalState}`);
  }

  const board = findBoardBox(image);
  const state = detectScreenState(image, board);
  if (!board) return emptyResult(image, state, 'Board border was not found. No taps are safe.');

  const grid = detectGridSize(image, board);
  if (!grid) return {
    ...emptyResult(image, 'UNKNOWN', 'Board found, but grid size was ambiguous.'),
    boardBox: board,
    diagnostics: { boardConfidence: board.confidence, gridConfidence: 0, regionConfidence: 0, message: 'Grid size was ambiguous.' },
  };

  const fallbackCenters = getGridCentersForN(grid.N, board);
  const centers = {
    colCenters: grid.colCenters || fallbackCenters.colCenters,
    rowCenters: grid.rowCenters || fallbackCenters.rowCenters,
  };
  const extracted = extractRegionsForN(image, grid.N, centers.colCenters, centers.rowCenters, board);
  const solution = solveMeowdoku(grid.N, extracted.regions, extracted.prePlacedCats);
  const confidence = Math.min(board.confidence, grid.confidence, extracted.confidence);
  const safe = extracted.regions.length === grid.N && solution.solved && solution.cats.length === grid.N;

  return {
    N: grid.N,
    rowCenters: centers.rowCenters,
    colCenters: centers.colCenters,
    scaleX: origW / image.width,
    scaleY: origH / image.height,
    origW,
    origH,
    regions: extracted.regions,
    gridColors: extracted.gridColors,
    prePlacedCats: extracted.prePlacedCats,
    solution: safe ? solution.cats : undefined,
    screenState: safe ? 'GAME_BOARD' : 'UNKNOWN',
    boardBox: board,
    confidence,
    diagnostics: {
      boardConfidence: board.confidence,
      gridConfidence: grid.confidence,
      regionConfidence: extracted.confidence,
      message: safe ? undefined : 'Detection did not pass the safety threshold; taps were suppressed.',
    },
  };
}
