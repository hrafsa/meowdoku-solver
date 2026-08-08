import React from 'react';
import { Usb, Smartphone, CheckCircle2, AlertCircle } from 'lucide-react';

interface USBConnectionCardProps {
  isConnected: boolean;
  deviceName?: string;
  onOpenModal: () => void;
  onDisconnect: () => void;
  isWebUsbSupported: boolean;
}

export const USBConnectionCard: React.FC<USBConnectionCardProps> = ({
  isConnected,
  deviceName,
  onOpenModal,
  onDisconnect,
  isWebUsbSupported,
}) => {
  return (
    <div className={`brutal-card p-3.5 shrink-0 transition-all ${
      isConnected ? 'bg-emerald-100' : 'bg-sky-100'
    }`}>
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b-3 border-slate-900">
        <div className="flex items-center gap-2">
          <Usb className="w-4 h-4 text-slate-900" />
          <h2 className="text-xs font-extrabold text-slate-900">USB Device Connection</h2>
        </div>
        {isConnected ? (
          <span className="flex items-center gap-1 text-[10px] font-mono font-bold px-1.5 py-0.2 bg-emerald-300 text-slate-900 brutal-border-sm rounded">
            <CheckCircle2 className="w-3 h-3 text-slate-900" /> WebADB Ready
          </span>
        ) : (
          <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 bg-rose-200 text-rose-900 brutal-border-sm rounded">
            Offline
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-2 rounded-xl border-2 border-slate-900 shrink-0 ${
            isConnected ? 'bg-emerald-300' : 'bg-sky-300'
          }`}>
            <Smartphone className="w-4.5 h-4.5 text-slate-900" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-extrabold text-slate-900 truncate block">
              {isConnected ? (deviceName || 'Android Device') : 'No Device Connected'}
            </span>
            <span className="text-[10px] font-semibold text-slate-700 block truncate">
              {isConnected ? 'USB Debugging Active' : 'Connect via WebUSB API'}
            </span>
          </div>
        </div>

        <div>
          {isConnected ? (
            <button
              onClick={onDisconnect}
              className="px-3 py-1.5 rounded-xl bg-rose-300 hover:bg-rose-400 text-slate-900 text-xs font-extrabold brutal-btn shrink-0"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={onOpenModal}
              disabled={!isWebUsbSupported}
              className="px-3 py-1.5 rounded-xl bg-yellow-300 hover:bg-yellow-400 text-slate-900 text-xs font-extrabold brutal-btn flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              <Usb className="w-3.5 h-3.5 text-slate-900" />
              <span>Connect USB</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
