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
        background: '#0a0a0a',
        foreground: '#9b9b9b',
        cursor: '#d97757',
        selectionBackground: 'rgba(217, 119, 87, 0.3)',
        black: '#0a0a0a',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#6a9bcc',
        magenta: '#a855f7',
        cyan: '#22d3ee',
        white: '#e0e0e0',
        brightBlack: '#1a1a1a',
        brightRed: '#ef4444',
        brightGreen: '#22c55e',
        brightYellow: '#f59e0b',
        brightBlue: '#6a9bcc',
        brightMagenta: '#c084fc',
        brightCyan: '#06b6d4',
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
      style={{ backgroundColor: '#0a0a0a' }}
    />
  );
}
