import type { TerminalHandle } from './Terminal';

/** Writes a human-readable connection protocol into an xterm instance using ANSI colors. */

const ANSI = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function timestamp(): string {
  return new Date().toLocaleTimeString(undefined, { hour12: false });
}

function line(term: TerminalHandle, color: string, symbol: string, text: string): void {
  term.write(`${ANSI.gray}${timestamp()}${ANSI.reset} ${color}${symbol}${ANSI.reset} ${text}\r\n`);
}

function sub(term: TerminalHandle, text: string): void {
  term.write(`${ANSI.dim}           ${text}${ANSI.reset}\r\n`);
}

export type ConnectingInfo = {
  target: string;
  auth: string;
  transport: string;
  jumpHost?: string | null;
  retry?: boolean;
};

export function logConnecting(term: TerminalHandle, info: ConnectingInfo): void {
  term.write('\r\n');
  line(
    term,
    ANSI.cyan,
    '▶',
    `${ANSI.bold}${info.retry ? 'Reconnecting' : 'Connecting'}${ANSI.reset} to ${info.target}`,
  );
  sub(term, `auth: ${info.auth}`);
  sub(term, `transport: ${info.transport}`);
  if (info.jumpHost) sub(term, `jump host: ${info.jumpHost}`);
}

export function logHostKey(term: TerminalHandle, fingerprint: string): void {
  line(term, ANSI.yellow, '⚠', 'Unknown host key — waiting for trust confirmation');
  sub(term, fingerprint);
}

export function logConnected(term: TerminalHandle, fingerprint?: string): void {
  line(term, ANSI.green, '✔', `${ANSI.bold}Connected${ANSI.reset}`);
  if (fingerprint && fingerprint !== 'proxy-verified') sub(term, `host key: ${fingerprint}`);
}

export function logError(term: TerminalHandle, message: string): void {
  line(term, ANSI.red, '✖', `${ANSI.bold}Connection failed${ANSI.reset}`);
  for (const part of message.split('\n')) if (part.trim()) sub(term, part);
}

export function logClosed(term: TerminalHandle): void {
  line(term, ANSI.yellow, '■', 'Connection closed');
}
