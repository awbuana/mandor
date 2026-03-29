import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { TerminalSession } from '@/types';
import { invoke } from '@tauri-apps/api/core';

interface TerminalInstanceProps {
  terminal: TerminalSession;
}

export function TerminalInstance({ terminal }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal instance
    const term = new Terminal({
      theme: {
        background: '#0f172a',
        foreground: '#94a3b8',
        cursor: '#60a5fa',
        selectionBackground: '#1e40af',
        black: '#020617',
        red: '#ef4444',
        green: '#10b981',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f8fafc',
        brightBlack: '#1e293b',
        brightRed: '#f87171',
        brightGreen: '#34d399',
        brightYellow: '#fbbf24',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      cursorBlink: true,
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    // Initialize terminal with some info
    term.writeln('\x1b[34mWelcome to Mandor Workbench Terminal\x1b[0m');
    term.writeln(`\x1b[90mWorking directory: ${terminal.worktree_path}\x1b[0m`);
    term.writeln(`\x1b[90mAgent type: ${terminal.agent_type}\x1b[0m`);
    term.writeln('');

    // Try to spawn the agent process
    const spawnAgent = async () => {
      try {
        await invoke('spawn_terminal', {
          worktreePath: terminal.worktree_path,
          agentType: terminal.agent_type,
        });
        term.writeln('\x1b[32mAgent process spawned successfully\x1b[0m');
      } catch (error) {
        term.writeln(`\x1b[31mFailed to spawn agent: ${error}\x1b[0m`);
        term.writeln('\x1b[33mFalling back to local terminal...\x1b[0m');
      }
    };

    spawnAgent();

    // Handle input
    term.onData((data) => {
      // Echo input for now - in real implementation, this would send to PTY
      term.write(data);
    });

    // Handle resize
    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (terminalRef.current) {
        terminalRef.current.dispose();
      }
    };
  }, [terminal.id]);

  return (
    <div 
      ref={containerRef} 
      className="h-full w-full p-2"
      style={{ backgroundColor: '#0f172a' }}
    />
  );
}
