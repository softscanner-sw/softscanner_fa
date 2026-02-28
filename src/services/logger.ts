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

import * as fs from 'node:fs';
import * as path from 'node:path';

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
// FileLogger — writes structured log lines to a file (for --debug audits)
// ---------------------------------------------------------------------------

export class FileLogger implements Logger {
  private readonly _minLevel: number;
  private readonly _prefix: string;
  private readonly _lines: string[] = [];

  constructor(level: LogLevel = 'debug', prefix = 'softscanner') {
    this._minLevel = LEVEL_ORDER[level];
    this._prefix = prefix;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this._minLevel > LEVEL_ORDER['debug']) return;
    this._append('DEBUG', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this._minLevel > LEVEL_ORDER['info']) return;
    this._append('INFO ', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this._minLevel > LEVEL_ORDER['warn']) return;
    this._append('WARN ', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (this._minLevel > LEVEL_ORDER['error']) return;
    this._append('ERROR', message, context);
  }

  /** Flush accumulated log lines to a file. */
  flush(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, this._lines.join('\n') + '\n', 'utf-8');
  }

  private _append(
    label: string,
    message: string,
    context?: Record<string, unknown>,
  ): void {
    const ts = new Date().toISOString().slice(11, 23);
    const ctx = context !== undefined ? '  ' + JSON.stringify(context) : '';
    this._lines.push(`${ts} [${this._prefix}] [${label}] ${message}${ctx}`);
  }
}

// ---------------------------------------------------------------------------
// TeeLogger — writes to both console and file
// ---------------------------------------------------------------------------

export class TeeLogger implements Logger {
  private readonly _console: ConsoleLogger;
  private readonly _file: FileLogger;

  constructor(level: LogLevel = 'debug', prefix = 'softscanner') {
    this._console = new ConsoleLogger(level, prefix);
    this._file = new FileLogger(level, prefix);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this._console.debug(message, context);
    this._file.debug(message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this._console.info(message, context);
    this._file.info(message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this._console.warn(message, context);
    this._file.warn(message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this._console.error(message, context);
    this._file.error(message, context);
  }

  flush(filePath: string): void {
    this._file.flush(filePath);
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
