import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { spawn } from 'tauri-pty'
import { invoke } from '@/lib/invokeLogger'
import { useAppStore } from '@/stores/appStore'
import '@xterm/xterm/css/xterm.css'

interface TuiViewProps {
  worktreePath: string
  port: number
  isVisible: boolean
}

export function TuiView({ worktreePath, port, isVisible }: TuiViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const ptyRef = useRef<ReturnType<typeof spawn> | null>(null)
  const openedRef = useRef(false)

  const setOpencodeServer = useAppStore((s) => s.setOpencodeServer)

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
    terminalRef.current = term
    fitAddonRef.current = fitAddon

    // Spawn opencode TUI with a fixed port so we can reach its HTTP server
    console.log('Spawning opencode TUI with port', port)
    const pty = spawn('opencode', ['--port', String(port)], {
      cols: term.cols,
      rows: term.rows,
      cwd: worktreePath,
      env: {},
    })

    ptyRef.current = pty

    // Bridge xterm input → PTY (registered before open so no keystrokes are lost)
    term.onData((data: string) => {
      pty.write(data)
    })

    // Handle PTY exit
    pty.onExit(({ exitCode }: { exitCode: number }) => {
      term.writeln(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m`)
    })

    const tryOpen = () => {
      if (!containerRef.current || openedRef.current) return
      if (containerRef.current.offsetWidth === 0 || containerRef.current.offsetHeight === 0) return

      term.open(containerRef.current)
      openedRef.current = true

      fitAddon.fit()
      pty.resize(term.cols, term.rows)

      pty.onData((data: Uint8Array) => {
        term.write(data)
      })
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current) return
      if (containerRef.current.offsetWidth === 0 || containerRef.current.offsetHeight === 0) return

      if (!openedRef.current) {
        tryOpen()
        return
      }
      fitAddon.fit()
      pty.resize(term.cols, term.rows)
    })

    resizeObserver.observe(containerRef.current)
    tryOpen()

    // Poll health endpoint then create a session — runs after PTY spawns
    invoke<{ port: number; hostname: string; session_id: string }>(
      'start_opencode_server',
      { worktreePath, port, hostname: '127.0.0.1' }
    ).then((info) => {
      setOpencodeServer(worktreePath, {
        isRunning: true,
        port: info.port,
        hostname: info.hostname,
        sessionId: info.session_id,
      })
    })
      .catch((err) => {
        console.log(err)
      })

    return () => {
      resizeObserver.disconnect()
      pty.kill()
      term.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      ptyRef.current = null
      openedRef.current = false
      invoke('stop_opencode_server', { worktreePath }).catch((err) => {
        console.log('Failed to stop opencode server:', err)
      })
    }
  }, [worktreePath, port])

  useEffect(() => {
    if (!isVisible) return
    if (!openedRef.current || !fitAddonRef.current || !terminalRef.current) return

    setTimeout(() => {
      if (!fitAddonRef.current || !terminalRef.current || !ptyRef.current) return
      fitAddonRef.current.fit()
      ptyRef.current.resize(terminalRef.current.cols, terminalRef.current.rows)
    }, 50)
  }, [isVisible])

  // useEffect(() => {
  //   if (!isVisible) return
  //   if (!openedRef.current || !fitAddonRef.current || !terminalRef.current) return

  //   const rafId = requestAnimationFrame(() => {
  //     if (!fitAddonRef.current || !terminalRef.current || !ptyRef.current) return
  //     try {
  //       fitAddonRef.current.fit()
  //       ptyRef.current.resize(terminalRef.current.cols, terminalRef.current.rows)
  //     } catch (_) {
  //       // renderer not ready; ResizeObserver will handle it
  //     }
  //   })

  //   return () => cancelAnimationFrame(rafId)
  // }, [isVisible])

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: '#0a0a0a', padding: '4px' }}
    />
  )
}