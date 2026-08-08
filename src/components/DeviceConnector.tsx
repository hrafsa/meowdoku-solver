import React from 'react';
import { Cat, Github, CheckCircle2, Smartphone, AlertCircle } from 'lucide-react';

interface DeviceConnectorProps {
  isConnected: boolean;
  deviceName?: string;
  isWebUsbSupported: boolean;
}

export const DeviceConnector: React.FC<DeviceConnectorProps> = ({
  isConnected,
  deviceName,
  isWebUsbSupported,
}) => {
  if (!isWebUsbSupported) {
    return (
      <div className="bg-rose-200 brutal-card p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-400 rounded-xl border-2 border-slate-900 text-slate-900">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">WebUSB API Not Supported</h3>
            <p className="text-xs text-slate-800 mt-0.5 font-medium">
              Please use <strong>Google Chrome, Microsoft Edge, Brave, or Opera</strong> on desktop.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <header className="shrink-0 bg-amber-200 border-b-3 border-slate-900 px-5 py-2 shadow-sm z-30 mb-4">
      <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3 h-10">
        {/* Brand logo & title */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-orange-400 brutal-border brutal-shadow-sm flex items-center justify-center shrink-0">
            <Cat className="w-5 h-5 text-slate-900 font-bold" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-tight text-slate-900 leading-none">
                Meowdoku Solver
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-sky-300 text-slate-900 brutal-border-sm rounded brutal-shadow-sm">
                WebADB
              </span>
            </div>
            <p className="text-[10px] font-semibold text-slate-700 leading-tight mt-0.5">
              Auto-CV Grid Solver
            </p>
          </div>
        </div>

        {/* Device Status Bar in Center */}
        <div className="hidden md:flex items-center gap-2 px-3 h-9 bg-white brutal-border rounded-xl brutal-shadow-sm">
          <Smartphone className="w-4 h-4 text-slate-900" />
          <span className="text-xs font-extrabold text-slate-900">
            {isConnected ? (deviceName || 'Android Device') : 'No Device Connected'}
          </span>
          {isConnected ? (
            <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.5 bg-emerald-300 text-slate-900 brutal-border-sm rounded">
              <CheckCircle2 className="w-3 h-3 text-slate-900" /> WebADB Ready
            </span>
          ) : (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-rose-200 text-rose-900 brutal-border-sm rounded">
              Offline
            </span>
          )}
        </div>

        {/* GitHub Repository Link on Far Right */}
        <div className="flex items-center gap-2">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-9 h-9 rounded-xl bg-purple-300 hover:bg-purple-400 text-slate-900 brutal-btn flex items-center justify-center shrink-0"
            title="GitHub Repository"
          >
            <Github className="w-4.5 h-4.5 text-slate-900" />
          </a>
        </div>
      </div>
    </header>
  );
};
