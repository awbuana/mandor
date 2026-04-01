import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { TerminalSession } from '@/types'
import { invoke } from '@tauri-apps/api/core'
import { listen, UnlistenFn } from '@tauri-apps/api/event'

interface TerminalInstanceProps {
  terminal: TerminalSession
}

export function TerminalInstance({ terminal }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const unlistenRef = useRef<UnlistenFn | null>(null)
  const isSpawnedRef = useRef(false)

  useEffect(() => {
    if (!containerRef.current) return

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
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)

    term.open(containerRef.current)
    fitAddon.fit()

    terminalRef.current = term
    fitAddonRef.current = fitAddon

    term.writeln('\x1b[34mWelcome to Mandor Workbench Terminal\x1b[0m')
    term.writeln(`\x1b[90mWorking directory: ${terminal.worktree_path}\x1b[0m`)
    term.writeln(`\x1b[90mAgent type: ${terminal.agent_type}\x1b[0m`)
    term.writeln('')

    const spawnAgent = async () => {
      if (isSpawnedRef.current) return
      isSpawnedRef.current = true

      try {
        await invoke('spawn_terminal', {
          worktreePath: terminal.worktree_path,
          agentType: terminal.agent_type,
        })
        term.writeln('\x1b[32mAgent process spawned successfully\x1b[0m')
        term.writeln('')

        const eventName = `terminal-output-${terminal.id}`
        const unlisten = await listen<string>(eventName, (event) => {
          if (term && event.payload !== 'EOF') {
            term.write(event.payload)
          }
        })
        unlistenRef.current = unlisten
      } catch (error) {
        term.writeln(`\x1b[31mFailed to spawn agent: ${error}\x1b[0m`)
        term.writeln('\x1b[33mFalling back to local terminal...\x1b[0m')
      }
    }

    spawnAgent()

    term.onData((data) => {
      invoke('write_to_terminal', {
        sessionId: terminal.id,
        input: data,
      }).catch((error) => {
        console.error('Failed to write to terminal:', error)
      })
    })

    const handleResize = () => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit()
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims && dims.cols && dims.rows) {
          invoke('resize_terminal', {
            sessionId: terminal.id,
            cols: dims.cols,
            rows: dims.rows,
          }).catch((error) => {
            console.error('Failed to resize terminal:', error)
          })
        }
      }
    }

    window.addEventListener('resize', handleResize)

    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
      if (unlistenRef.current) {
        unlistenRef.current()
      }
      invoke('kill_terminal', {
        sessionId: terminal.id,
      }).catch((error) => {
        console.error('Failed to kill terminal:', error)
      })
      if (terminalRef.current) {
        terminalRef.current.dispose()
      }
    }
  }, [terminal.id, terminal.worktree_path, terminal.agent_type])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: '#0a0a0a' }}
    />
  )
}