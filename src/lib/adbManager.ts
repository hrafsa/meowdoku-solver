/**
 * WebADB Manager using @yume-chan/adb and WebUSB API
 * Enables direct browser-to-Android USB debugging communication
 */

import { Adb, AdbCredentialStore, AdbDaemonTransport, AdbSubprocessService } from '@yume-chan/adb';
import { AdbWebUsbBackendManager } from '@yume-chan/adb-backend-webusb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';

export interface DeviceInfo {
  name: string;
  serial: string;
  connected: boolean;
}

export class AdbManager {
  private adb: Adb | null = null;
  private subprocessService: AdbSubprocessService | null = null;
  private credentialStore: AdbCredentialStore;
  private deviceName: string = '';
  private onDisconnectCallback: (() => void) | null = null;

  constructor() {
    this.credentialStore = new AdbWebCredentialStore();
    this.setupUsbDisconnectListener();
  }

  /**
   * Sets up native WebUSB disconnect listener
   */
  private setupUsbDisconnectListener(): void {
    if (typeof navigator !== 'undefined' && 'usb' in navigator) {
      navigator.usb.addEventListener('disconnect', (event) => {
        console.warn('[ADB] Physical USB Device disconnected:', event);
        this.forceReset();
        if (this.onDisconnectCallback) {
          this.onDisconnectCallback();
        }
      });
    }
  }

  /**
   * Registers a callback for unexpected USB disconnect events
   */
  public setOnDisconnect(callback: () => void): void {
    this.onDisconnectCallback = callback;
  }

  /**
   * Checks if WebUSB API is supported by the current browser
   */
  public static isSupported(): boolean {
    return typeof navigator !== 'undefined' && 'usb' in navigator;
  }

  /**
   * Requests USB device selection and connects via WebADB
   */
  public async connect(): Promise<string> {
    if (!AdbManager.isSupported()) {
      throw new Error('WebUSB API is not supported in this browser. Please use Chrome, Edge, or Opera.');
    }

    const manager = AdbWebUsbBackendManager.BROWSER;
    if (!manager) {
      throw new Error('WebUSB is not available.');
    }

    // Request USB Device from user prompt
    const backend = await manager.requestDevice();
    if (!backend) {
      throw new Error('No Android device selected.');
    }

    try {
      const connection = await backend.connect();

      // Authenticate ADB session over USB
      const transport = await AdbDaemonTransport.authenticate({
        serial: backend.serial || 'Android Device',
        connection: connection as any,
        credentialStore: this.credentialStore,
      });

      this.adb = new Adb(transport);
      this.subprocessService = new AdbSubprocessService(this.adb);

      // Fetch device model name
      try {
        const model = await this.adb.getProp('ro.product.model');
        this.deviceName = model || backend.serial || 'Android Device';
      } catch {
        this.deviceName = backend.serial || 'Android Device';
      }

      return this.deviceName;
    } catch (err: any) {
      this.forceReset();
      if (err && err.message && err.message.includes('claimInterface')) {
        throw new Error('Port USB sedang terkunci oleh adb.exe / skrip Python. Silakan buka Terminal dan jalankan command `adb kill-server` lalu coba lagi.');
      }
      throw err;
    }
  }

  /**
   * Forces instant cleanup of ADB session state without throwing errors
   */
  public forceReset(): void {
    this.adb = null;
    this.subprocessService = null;
    this.deviceName = '';
  }

  /**
   * Disconnects current ADB session gracefully with bulletproof try...finally
   */
  public async disconnect(): Promise<void> {
    if (this.adb) {
      try {
        await this.adb.close();
      } catch (err) {
        console.warn('[ADB] Ignored error during adb.close():', err);
      } finally {
        this.forceReset();
      }
    } else {
      this.forceReset();
    }
  }

  /**
   * Checks if an ADB session is active
   */
  public isConnected(): boolean {
    return this.adb !== null;
  }

  /**
   * Gets current connected device model name
   */
  public getDeviceName(): string {
    return this.deviceName;
  }

  /**
   * Captures screen screenshot via `screencap -p` stream over WebADB
   */
  public async captureScreen(): Promise<Blob> {
    if (!this.adb || !this.subprocessService) {
      throw new Error('ADB is not connected.');
    }

    try {
      // Run screencap command
      const process = await this.subprocessService.noneProtocol.spawn('screencap -p');
      
      // Read output stream
      const reader = (process as any).output.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
        }
      }

      const blob = new Blob(chunks as BlobPart[], { type: 'image/png' });
      return blob;
    } catch (err: any) {
      console.error('[ADB] Screenshot stream error:', err);
      this.forceReset();
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback();
      }
      throw new Error('Koneksi USB terputus saat mengambil gambar layar. Silakan hubungkan ulang USB.');
    }
  }

  /**
   * Performs ADB input tap via native `input tap X Y`
   */
  public async tap(x: number, y: number, count: number = 1): Promise<void> {
    if (!this.adb || !this.subprocessService) {
      throw new Error('ADB is not connected.');
    }

    try {
      const ix = Math.round(x);
      const iy = Math.round(y);

      const cmds: string[] = [];
      for (let i = 0; i < count; i++) {
        cmds.push(`input tap ${ix} ${iy}`);
        if (i < count - 1) {
          cmds.push('sleep 0.05');
        }
      }

      const fullCmd = cmds.join(' && ');
      const process = await this.subprocessService.noneProtocol.spawn(fullCmd);

      // Drain process stream to ensure shell command finishes on device
      const reader = (process as any).output.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    } catch (err: any) {
      console.error('[ADB] Tap execution error:', err);
      this.forceReset();
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback();
      }
      throw new Error('Koneksi USB terputus saat mengeksekusi tap. Silakan hubungkan ulang USB.');
    }
  }

  /**
   * Performs batch taps via native `input tap X Y`
   */
  public async tapBatch(points: { x: number; y: number }[], count: number = 2, delaySec: number = 0.01): Promise<void> {
    if (!this.adb || !this.subprocessService) {
      throw new Error('ADB is not connected.');
    }

    try {
      const cmds: string[] = [];
      for (const p of points) {
        const ix = Math.round(p.x);
        const iy = Math.round(p.y);
        for (let i = 0; i < count; i++) {
          cmds.push(`input tap ${ix} ${iy}`);
          if (i < count - 1) {
            cmds.push('sleep 0.05');
          }
        }
        if (delaySec > 0) {
          cmds.push(`sleep ${delaySec}`);
        }
      }

      if (cmds.length > 0) {
        if (cmds[cmds.length - 1].startsWith('sleep')) {
          cmds.pop();
        }
        const fullCmd = cmds.join(' && ');
        const process = await this.subprocessService.noneProtocol.spawn(fullCmd);

        // Drain process stream to ensure shell command finishes on device
        const reader = (process as any).output.getReader();
        while (true) {
          const { done } = await reader.read();
          if (done) break;
        }
      }
    } catch (err: any) {
      console.error('[ADB] Batch tap execution error:', err);
      this.forceReset();
      if (this.onDisconnectCallback) {
        this.onDisconnectCallback();
      }
      throw new Error('Koneksi USB terputus saat mengeksekusi batch tap. Silakan hubungkan ulang USB.');
    }
  }
}

export const adbManager = new AdbManager();
