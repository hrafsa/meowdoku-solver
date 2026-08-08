import React from 'react';
import { Play, Repeat, Sparkles, Zap } from 'lucide-react';
import { GridDetectionResult } from '../lib/visionEngine';

interface ControlPanelProps {
  isConnected: boolean;
  isSolving: boolean;
  isAutoLoop: boolean;
  detection: GridDetectionResult | null;
  onCaptureAndSolve: () => void;
  onToggleAutoLoop: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isConnected,
  isSolving,
  isAutoLoop,
  onCaptureAndSolve,
  onToggleAutoLoop,
}) => {
  return (
    <div className="bg-amber-100 brutal-card p-3.5 flex flex-col justify-between shrink-0">
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2 pb-2 border-b-3 border-slate-900">
          <Zap className="w-4 h-4 text-slate-900" />
          <h2 className="text-xs font-extrabold text-slate-900">Auto-Solve Controls</h2>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 gap-2">
          {/* Primary Action Button */}
          <button
            onClick={onCaptureAndSolve}
            disabled={isSolving}
            className="w-full py-2.5 px-4 rounded-xl bg-orange-400 hover:bg-orange-500 text-slate-900 font-extrabold text-xs brutal-btn flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSolving ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin text-slate-900" />
                <span>Auto-Solving Level...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-slate-900 text-slate-900" />
                <span>{isConnected ? 'Capture & Auto-Solve Phone' : 'Capture & Solve Screen'}</span>
              </>
            )}
          </button>

          {/* Continuous Auto-Loop Toggle Button */}
          <button
            onClick={onToggleAutoLoop}
            disabled={!isConnected}
            className={`w-full py-2 px-3 rounded-xl font-extrabold text-xs brutal-btn flex items-center justify-center gap-2 ${
              isAutoLoop
                ? 'bg-purple-300 hover:bg-purple-400 text-slate-900'
                : 'bg-white hover:bg-slate-100 text-slate-900'
            } disabled:opacity-50`}
          >
            <Repeat className={`w-3.5 h-3.5 ${isAutoLoop ? 'animate-spin' : ''}`} />
            <span>Continuous Auto-Loop: {isAutoLoop ? 'ENABLED' : 'DISABLED'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
