import React, { useRef, useEffect } from 'react';
import { Terminal, Trash2 } from 'lucide-react';

export interface LogEntry {
  id: string;
  type: 'info' | 'success' | 'warn' | 'error';
  message: string;
  timestamp: string;
}

interface TerminalLogsProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

export const TerminalLogs: React.FC<TerminalLogsProps> = ({ logs, onClearLogs }) => {
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const getTypeStyle = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return 'text-emerald-900 font-extrabold bg-emerald-300 px-1 rounded shrink-0';
      case 'warn':
        return 'text-amber-900 font-extrabold bg-amber-300 px-1 rounded shrink-0';
      case 'error':
        return 'text-rose-900 font-extrabold bg-rose-300 px-1 rounded shrink-0';
      default:
        return 'text-sky-900 font-extrabold bg-sky-300 px-1 rounded shrink-0';
    }
  };

  const getTypeBadge = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return '[OK]';
      case 'warn':
        return '[WARN]';
      case 'error':
        return '[ERR]';
      default:
        return '[*]';
    }
  };

  return (
    <div className="bg-sky-100 brutal-card p-3.5 flex flex-col h-full min-h-0 overflow-hidden">
      {/* Log Header */}
      <div className="shrink-0 flex items-center justify-between pb-2 mb-2 border-b-3 border-slate-900">
        <div className="flex items-center gap-1.5">
          <Terminal className="w-4 h-4 text-slate-900" />
          <span className="text-xs font-extrabold font-mono text-slate-900">Diagnostics Log</span>
        </div>
        <button
          onClick={onClearLogs}
          className="px-2 py-0.5 bg-white hover:bg-slate-100 rounded-lg text-slate-900 text-[10px] font-extrabold brutal-border-sm brutal-shadow-sm flex items-center gap-1 transition-all"
          title="Clear Logs"
        >
          <Trash2 className="w-3 h-3 text-slate-900" />
          <span>Clear</span>
        </button>
      </div>

      {/* Terminal Content Window */}
      <div className="flex-1 min-h-0 bg-amber-50 rounded-xl p-2.5 font-mono text-[11px] overflow-y-auto space-y-1 brutal-border">
        {logs.length === 0 ? (
          <div className="text-slate-500 font-bold italic">No diagnostics logs recorded...</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
              <span className="text-slate-500 select-none font-semibold shrink-0">{log.timestamp}</span>
              <span className={getTypeStyle(log.type)}>
                {getTypeBadge(log.type)}
              </span>
              <span className="text-slate-900 font-medium truncate min-w-0" title={log.message}>
                {log.message}
              </span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};
