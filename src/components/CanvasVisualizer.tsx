import React, { useRef, useEffect, useState } from 'react';
import { GridDetectionResult } from '../lib/visionEngine';
import { Point } from '../lib/meowdokuSolver';
import { Smartphone, Eye, Cpu } from 'lucide-react';

interface CanvasVisualizerProps {
  imageSrc: string | null;
  detection: GridDetectionResult | null;
  solution?: Point[] | null;
  showGridOverlay?: boolean;
  showRegionsOverlay?: boolean;
  onToggleGrid?: () => void;
  onToggleRegions?: () => void;
}

export const CanvasVisualizer: React.FC<CanvasVisualizerProps> = ({
  imageSrc,
  detection,
  solution = detection?.solution || null,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showGrid, setShowGrid] = useState(true);
  const [showRegions, setShowRegions] = useState(true);

  useEffect(() => {
    if (!canvasRef.current || !imageSrc) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      // Base screenshot
      ctx.drawImage(img, 0, 0);

      // Draw Grid & Solutions ONLY if GAME_BOARD active and valid detection exists
      if (
        showGrid &&
        detection &&
        detection.N > 0 &&
        detection.colCenters.length > 0
      ) {
        const { N, colCenters, rowCenters, scaleX, scaleY } = detection;

        const cellW = N > 1 ? (colCenters[1] - colCenters[0]) * scaleX : 0;
        const cellH = N > 1 ? (rowCenters[1] - rowCenters[0]) * scaleY : 0;

        // 1. Tint detected regions so bad segmentation is immediately visible.
        if (showRegions) {
          const palette = ['#38BDF8', '#F472B6', '#34D399', '#FBBF24', '#A78BFA', '#FB7185', '#2DD4BF', '#F97316', '#60A5FA', '#A3E635'];
          detection.regions.forEach((region, regionIndex) => {
            ctx.fillStyle = `${palette[regionIndex % palette.length]}55`;
            region.forEach(cell => {
              const cx = colCenters[cell.c] * scaleX;
              const cy = rowCenters[cell.r] * scaleY;
              ctx.fillRect(cx - cellW / 2, cy - cellH / 2, cellW, cellH);
            });
          });
        }

        // 2. Draw grid overlay boxes
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = Math.max(3, Math.round(4 * scaleX));

        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const cx = colCenters[c] * scaleX;
            const cy = rowCenters[r] * scaleY;
            const x1 = cx - cellW / 2;
            const y1 = cy - cellH / 2;

            ctx.strokeRect(x1, y1, cellW, cellH);

            // Center dot
            ctx.fillStyle = '#EF4444';
            ctx.beginPath();
            ctx.arc(cx, cy, Math.max(4, Math.round(5 * scaleX)), 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // 3. Draw Solved Cat Markers if available
        if (solution && solution.length > 0) {
          solution.forEach((cat, idx) => {
            const cx = colCenters[cat.c] * scaleX;
            const cy = rowCenters[cat.r] * scaleY;
            const radius = cellW * 0.38;

            ctx.fillStyle = '#F59E0B';
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#0F172A';
            ctx.lineWidth = Math.max(3, Math.round(4 * scaleX));
            ctx.stroke();

            // Cat index number
            ctx.fillStyle = '#0F172A';
            ctx.font = `900 ${Math.round(26 * scaleX)}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${idx + 1}`, cx, cy);
          });
        }
      }
    };

    img.src = imageSrc;
  }, [imageSrc, detection, solution, showGrid, showRegions]);

  return (
    <div className="bg-purple-200 brutal-card p-3.5 flex flex-col h-full min-h-0 justify-between">
      {/* Visualizer Top Bar */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b-3 border-slate-900 shrink-0">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-slate-900" />
          <span className="text-xs font-extrabold text-slate-900">Phone Screen Visualizer</span>
        </div>

        {/* Overlay Toggle Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold brutal-border-sm brutal-shadow-sm ${
              showGrid ? 'bg-sky-300 text-slate-900' : 'bg-white text-slate-500'
            }`}
          >
            Grid Lines
          </button>
          <button
            onClick={() => setShowRegions(!showRegions)}
            className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold brutal-border-sm brutal-shadow-sm ${
              showRegions ? 'bg-pink-300 text-slate-900' : 'bg-white text-slate-500'
            }`}
          >
            Regions
          </button>
        </div>
      </div>

      {/* Main Canvas Frame */}
      <div className="flex-1 bg-white brutal-border rounded-xl p-2.5 sm:p-3 flex items-center justify-center min-h-[300px] sm:min-h-[380px] lg:min-h-0 relative overflow-hidden mb-2">
        {imageSrc ? (
          <canvas
            ref={canvasRef}
            className="max-h-[60vh] lg:max-h-full max-w-full w-auto h-auto object-contain block border-2 border-slate-900 rounded-lg shadow-md"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-4 sm:p-6">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-300 brutal-border flex items-center justify-center mb-2">
              <Smartphone className="w-5 h-5 sm:w-6 sm:h-6 text-slate-900" />
            </div>
            <h3 className="text-xs font-extrabold text-slate-900">No Screen Capture</h3>
            <p className="text-[10px] sm:text-[11px] text-slate-700 font-semibold mt-0.5">
              Connect phone via USB or click Capture & Auto-Solve.
            </p>
          </div>
        )}
      </div>

      {/* Embedded Auto-Detected Board Status Cards inside Left Box */}
      <div className="pt-2 border-t-3 border-slate-900 shrink-0">
        <div className="flex items-center gap-1.5 mb-2">
          <Cpu className="w-3.5 h-3.5 text-slate-900" />
          <span className="text-[11px] font-extrabold text-slate-900">Auto-Detected Board Status</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
          <div className="bg-sky-200 brutal-border p-1.5 sm:p-2 rounded-xl text-center">
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-700 block">Grid Size</span>
            <span className="text-[11px] sm:text-xs font-mono font-extrabold text-slate-900">
              {detection && detection.N > 0 ? `${detection.N} x ${detection.N}` : 'Auto-Detect'}
            </span>
          </div>

          <div className="bg-pink-200 brutal-border p-1.5 sm:p-2 rounded-xl text-center">
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-700 block">Color Regions</span>
            <span className="text-[11px] sm:text-xs font-mono font-extrabold text-slate-900">
              {detection && detection.regions.length > 0 ? `${detection.regions.length} Regions` : 'Auto-Clustered'}
            </span>
          </div>

          <div className="bg-emerald-200 brutal-border p-1.5 sm:p-2 rounded-xl text-center">
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-700 block">Taps per Cat</span>
            <span className="text-[11px] sm:text-xs font-mono font-extrabold text-slate-900">2 Taps (Auto)</span>
          </div>

          <div className="bg-purple-200 brutal-border p-1.5 sm:p-2 rounded-xl text-center">
            <span className="text-[9px] sm:text-[10px] font-bold text-slate-700 block">Confidence</span>
            <span className="text-[11px] sm:text-xs font-mono font-extrabold text-slate-900">
              {detection?.confidence !== undefined ? `${Math.round(detection.confidence * 100)}%` : 'Waiting'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
