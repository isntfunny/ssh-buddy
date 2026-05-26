import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export type TerminalHandle = {
  write: (bytes: Uint8Array | string) => void;
  fit: () => { cols: number; rows: number };
  focus: () => void;
};

type Props = {
  onData: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
};

export const Terminal = forwardRef<TerminalHandle, Props>(({ onData, onResize }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
      fontSize: 13,
      theme: { background: '#1a1b1e' },
      cursorBlink: true,
      scrollback: 10000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(containerRef.current);
    fit.fit();
    onResize(term.cols, term.rows);
    term.onData(onData);
    term.onResize(({ cols, rows }) => onResize(cols, rows));
    xtermRef.current = term;
    fitRef.current = fit;

    const onWindowResize = () => {
      fit.fit();
      onResize(term.cols, term.rows);
    };
    window.addEventListener('resize', onWindowResize);

    return () => {
      window.removeEventListener('resize', onWindowResize);
      term.dispose();
      xtermRef.current = null;
      fitRef.current = null;
    };
  }, [onData, onResize]);

  useImperativeHandle(
    ref,
    () => ({
      write: (bytes) => xtermRef.current?.write(bytes),
      fit: () => {
        fitRef.current?.fit();
        return { cols: xtermRef.current?.cols ?? 80, rows: xtermRef.current?.rows ?? 24 };
      },
      focus: () => xtermRef.current?.focus(),
    }),
    [],
  );

  return <div ref={containerRef} style={{ width: '100%', height: '100%', minHeight: 0 }} />;
});

Terminal.displayName = 'Terminal';
