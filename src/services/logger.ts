/**
 * logger.ts
 * Structured logger for Phase 1 extraction pipeline.
 *
 * Use ConsoleLogger in the CLI; SilentLogger in tests or when callers
 * do not care about output.
 *
 * All builders accept an optional Logger and default to SilentLogger,
 * so existing callers require no changes.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// ConsoleLogger
// ---------------------------------------------------------------------------

export class ConsoleLogger implements Logger {
  private readonly _minLevel: number;
  private readonly _prefix: string;

  constructor(level: LogLevel = 'info', prefix = 'softscanner') {
    this._minLevel = LEVEL_ORDER[level];
    this._prefix = prefix;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this._minLevel > LEVEL_ORDER['debug']) return;
    this._write('DEBUG', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this._minLevel > LEVEL_ORDER['info']) return;
    this._write('INFO ', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this._minLevel > LEVEL_ORDER['warn']) return;
    this._write('WARN ', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this._minLevel > LEVEL_ORDER['error']) return;
    this._write('ERROR', message, context, true);
  }

  private _write(
    label: string,
    message: string,
    context?: Record<string, unknown>,
    stderr = false,
  ): void {
    const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
    const ctx = context !== undefined ? '  ' + JSON.stringify(context) : '';
    const line = `${ts} [${this._prefix}] [${label}] ${message}${ctx}`;
    if (stderr) {
      process.stderr.write(line + '\n');
    } else {
      process.stdout.write(line + '\n');
    }
  }
}

// ---------------------------------------------------------------------------
// SilentLogger — used as default when no logger is supplied
// ---------------------------------------------------------------------------

export class SilentLogger implements Logger {
  debug(_message: string, _context?: Record<string, unknown>): void {}
  info(_message: string, _context?: Record<string, unknown>): void {}
  warn(_message: string, _context?: Record<string, unknown>): void {}
  error(_message: string, _context?: Record<string, unknown>): void {}
}
