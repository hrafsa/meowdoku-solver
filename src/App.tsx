import React, { useState, useEffect } from 'react';
import { DeviceConnector } from './components/DeviceConnector';
import { USBConnectionCard } from './components/USBConnectionCard';
import { ControlPanel } from './components/ControlPanel';
import { CanvasVisualizer } from './components/CanvasVisualizer';
import { TerminalLogs, LogEntry } from './components/TerminalLogs';

import { AdbManager } from './lib/adbManager';
import {
  processImageDataAuto,
  GridDetectionResult,
} from './lib/visionEngine';

export function App() {
  const [adb] = useState(() => new AdbManager());
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('');

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [detection, setDetection] = useState<GridDetectionResult | null>(null);

  const [isSolving, setIsSolving] = useState(false);
  const [isAutoLoop, setIsAutoLoop] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const newEntry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      type,
      message,
      timestamp,
    };
    setLogs(prev => {
      if (prev.length > 0 && prev[prev.length - 1].message === message) {
        return prev;
      }
      return [...prev.slice(-80), newEntry];
    });
  };

  useEffect(() => {
    addLog('System Initialized.', 'info');
    if (!AdbManager.isSupported()) {
      addLog('WebUSB API not supported in browser.', 'warn');
    }

    adb.setOnDisconnect(() => {
      setIsConnected(false);
      setDeviceName('');
      setIsAutoLoop(false);
      addLog('USB device disconnected.', 'warn');
    });
  }, [adb]);

  // Connect WebADB directly via WebUSB
  const handleConnect = async () => {
    addLog('Opening WebUSB prompt...', 'info');
    try {
      const name = await adb.connect();
      setIsConnected(true);
      setDeviceName(name);
      addLog(`Connected: ${name}`, 'success');
    } catch (err: any) {
      addLog(`Connection error: ${err.message || err}`, 'error');
    }
  };

  // Disconnect WebADB
  const handleDisconnect = async () => {
    try {
      await adb.disconnect();
    } catch (err: any) {
      console.warn('Disconnect error suppressed:', err);
    } finally {
      setIsConnected(false);
      setDeviceName('');
      setIsAutoLoop(false);
      addLog('Disconnected USB device.', 'info');
    }
  };

  // Core 100% Automatic Solver Pipeline
  const runImageAnalysisAuto = (src: string): Promise<GridDetectionResult | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const origW = img.width;
        const origH = img.height;

        const nativeCanvas = document.createElement('canvas');
        nativeCanvas.width = origW;
        nativeCanvas.height = origH;
        const ctx = nativeCanvas.getContext('2d', { willReadFrequently: true });

        if (!ctx) {
          addLog('Failed canvas context.', 'error');
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0);
        const nativeImageData = ctx.getImageData(0, 0, origW, origH);

        const detResult = processImageDataAuto(nativeImageData, origW, origH);
        setDetection(detResult);

        if (detResult.screenState === 'SCOREBOARD') {
          addLog(`Detected 'Papan Peringkat' (Scoreboard) pop-up screen!`, 'warn');
        } else if (detResult.screenState === 'VICTORY_SCREEN') {
          addLog(`Detected Victory Screen ("Kelas Master")!`, 'info');
        } else if (detResult.solution && detResult.solution.length > 0) {
          addLog(`Detected ${detResult.N}x${detResult.N} Grid (${detResult.regions.length} Regions, ${Math.round((detResult.confidence || 0) * 100)}% confidence). Solved!`, 'success');
        } else {
          const detail = detResult.diagnostics?.message || 'No solution found.';
          addLog(`Detection withheld: ${detail}`, 'warn');
        }

        resolve(detResult);
      };

      img.onerror = () => {
        addLog(`Failed to load image source.`, 'error');
        resolve(null);
        return;
      };

      img.src = src;
    });
  };

  // Single Level Capture & Solve Action
  const handleCaptureAndSolve = async () => {
    setIsSolving(true);

    try {
      if (isConnected) {
        addLog('Capturing screen via WebADB...', 'info');
        const blob = await adb.captureScreen();
        const url = URL.createObjectURL(blob);
        setImageSrc(url);

        const detResult = await runImageAnalysisAuto(url);

        if (detResult) {
          const origW = detResult.origW || 1080;
          const origH = detResult.origH || 2400;

          if (detResult.screenState === 'SCOREBOARD') {
            const tapX = Math.round(origW * 0.5);
            const tapY1 = Math.round(origH * 0.85);
            const tapY2 = Math.round(origH * 0.90);

            addLog(`Tapping Scoreboard ("Ketuk untuk melanjutkan") at native X=${tapX}, Y=${tapY1}, ${tapY2}...`, 'warn');
            await adb.tapBatch([{ x: tapX, y: tapY1 }, { x: tapX, y: tapY2 }], 1, 0.05);
            addLog('Tapped past Papan Peringkat!', 'success');
          } else if (detResult.screenState === 'VICTORY_SCREEN') {
            const tapX = Math.round(origW * 0.5);
            const tapY = Math.round(origH * 0.82);

            addLog(`Clicking Next Level button ("Kelas Master") at native X=${tapX}, Y=${tapY}...`, 'info');
            await adb.tapBatch([{ x: tapX, y: tapY }], 1, 0.05);
            addLog('Clicked Next Level button!', 'success');
          } else if (detResult.solution && detResult.solution.length > 0) {
            const existing = new Set((detResult.prePlacedCats || []).map(cat => `${cat.r},${cat.c}`));
            const tapTargets = detResult.solution.filter(cat => !existing.has(`${cat.r},${cat.c}`));
            addLog(`Executing ${tapTargets.length} new cat taps (${existing.size} already placed)...`, 'info');

            const pointsNative = tapTargets.map(cat => ({
              x: Math.round(detResult.colCenters[cat.c] * detResult.scaleX),
              y: Math.round(detResult.rowCenters[cat.r] * detResult.scaleY),
            }));

            await adb.tapBatch(pointsNative, 2, 0.01);
            addLog('Completed solving level!', 'success');
          }
        }
      } else {
        if (imageSrc) {
          await runImageAnalysisAuto(imageSrc);
        } else {
          addLog('Please connect Android device via USB.', 'warn');
        }
      }
    } catch (err: any) {
      addLog(`Error: ${err.message || err}`, 'error');
    } finally {
      setIsSolving(false);
    }
  };

  // Continuous Auto-Loop Mode
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const runAutoLoopCycle = async () => {
      if (!isAutoLoop || !isConnected || isSolving) return;

      setIsSolving(true);
      try {
        addLog('[Auto-Loop] Capturing screen for current level...', 'info');
        const blob = await adb.captureScreen();
        const url = URL.createObjectURL(blob);
        setImageSrc(url);

        const detResult = await runImageAnalysisAuto(url);

        if (!detResult) return;

        const origW = detResult.origW || 1080;
        const origH = detResult.origH || 2400;

        if (detResult.screenState === 'SCOREBOARD') {
          const tapX = Math.round(origW * 0.5);
          const tapY1 = Math.round(origH * 0.85);
          const tapY2 = Math.round(origH * 0.90);

          addLog(`[Auto-Loop] Tapping Scoreboard at X=${tapX}, Y=${tapY1}, ${tapY2}...`, 'warn');
          await adb.tapBatch([{ x: tapX, y: tapY1 }, { x: tapX, y: tapY2 }], 1, 0.05);
          addLog('[Auto-Loop] Scoreboard dismiss tap sent! Waiting 2s...', 'success');
          await new Promise(r => setTimeout(r, 2000));
        } else if (detResult.screenState === 'VICTORY_SCREEN') {
          const tapX = Math.round(origW * 0.5);
          const tapY = Math.round(origH * 0.82);

          addLog(`[Auto-Loop] Clicking Next Level button at X=${tapX}, Y=${tapY}...`, 'info');
          await adb.tapBatch([{ x: tapX, y: tapY }], 1, 0.05);
          await new Promise(r => setTimeout(r, 3000));
        } else if (detResult.solution && detResult.solution.length > 0) {
          const existing = new Set((detResult.prePlacedCats || []).map(cat => `${cat.r},${cat.c}`));
          const tapTargets = detResult.solution.filter(cat => !existing.has(`${cat.r},${cat.c}`));
          addLog(`[Auto-Loop] Solved level! Executing ${tapTargets.length} new cat taps...`, 'info');

          const pointsNative = tapTargets.map(cat => ({
            x: Math.round(detResult.colCenters[cat.c] * detResult.scaleX),
            y: Math.round(detResult.rowCenters[cat.r] * detResult.scaleY),
          }));

          await adb.tapBatch(pointsNative, 2, 0.01);
          addLog('[Auto-Loop] Taps completed! Waiting 4.5s for 3-fish collection animation...', 'success');

          // Wait 4.5 seconds for 3-fish collection animation
          await new Promise(r => setTimeout(r, 4500));

          const tapX = Math.round(origW * 0.5);
          const tapY1 = Math.round(origH * 0.85);
          const tapY2 = Math.round(origH * 0.90);

          // 1. Advance past Papan Peringkat ("Ketuk untuk melanjutkan")
          addLog(`[Auto-Loop] Tapping past Papan Peringkat (Scoreboard) at X=${tapX}, Y=${tapY1}...`, 'info');
          await adb.tapBatch([{ x: tapX, y: tapY1 }, { x: tapX, y: tapY2 }], 1, 0.05);

          await new Promise(r => setTimeout(r, 2000));

          // 2. Click Next Level Orange Button ("Level XXX")
          const nextLevelY = Math.round(origH * 0.82);
          addLog(`[Auto-Loop] Clicking Next Level button at X=${tapX}, Y=${nextLevelY}...`, 'info');
          await adb.tapBatch([{ x: tapX, y: nextLevelY }], 1, 0.05);

          addLog('[Auto-Loop] Waiting 3s for new level board to load...', 'info');
          await new Promise(r => setTimeout(r, 3000));
        } else {
          addLog('[Auto-Loop] Detection uncertain. Tap suppressed; retrying after a fresh screenshot.', 'warn');
          await new Promise(r => setTimeout(r, 2000));
        }
      } catch (err: any) {
        addLog(`[Auto-Loop] Error: ${err.message || err}`, 'error');
        await new Promise(r => setTimeout(r, 2500));
      } finally {
        setIsSolving(false);
        if (isAutoLoop && !isCancelled) {
          timeoutId = setTimeout(runAutoLoopCycle, 2000);
        }
      }
    };

    if (isAutoLoop && isConnected && !isSolving) {
      runAutoLoopCycle();
    }

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isAutoLoop, isConnected, adb]);

  return (
    <div className="min-h-screen lg:h-screen bg-amber-50 flex flex-col font-sans overflow-y-auto lg:overflow-hidden">
      {/* Top Header Navbar */}
      <DeviceConnector
        isConnected={isConnected}
        deviceName={deviceName}
        isWebUsbSupported={AdbManager.isSupported()}
      />

      {/* Main Responsive Layout */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-3 sm:px-4 pb-4 flex flex-col lg:flex-row gap-4 min-h-0">
        {/* Left Side: Screen Capture & Visualizer Box */}
        <div className="flex-1 min-w-0 flex flex-col min-h-[460px] sm:min-h-[520px] lg:min-h-0">
          <CanvasVisualizer
            imageSrc={imageSrc}
            detection={detection}
          />
        </div>

        {/* Right Side: Stacked Controls & Diagnostics */}
        <div className="w-full lg:w-[360px] flex flex-col gap-3.5 shrink-0 min-h-0">
          {/* Card 1: USB Device Connection Box */}
          <USBConnectionCard
            isConnected={isConnected}
            deviceName={deviceName}
            onOpenModal={handleConnect}
            onDisconnect={handleDisconnect}
            isWebUsbSupported={AdbManager.isSupported()}
          />

          {/* Card 2: Auto-Solve Controls Box */}
          <ControlPanel
            isConnected={isConnected}
            isSolving={isSolving}
            isAutoLoop={isAutoLoop}
            detection={detection}
            onCaptureAndSolve={handleCaptureAndSolve}
            onToggleAutoLoop={() => setIsAutoLoop(!isAutoLoop)}
          />

          {/* Card 3: Diagnostics Log Box */}
          <div className="h-64 lg:h-auto lg:flex-1 min-h-0">
            <TerminalLogs logs={logs} onClearLogs={() => setLogs([])} />
          </div>
        </div>
      </main>
    </div>
  );
}
export default App;
