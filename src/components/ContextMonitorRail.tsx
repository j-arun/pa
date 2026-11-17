import { Activity, AlertCircle, Cpu, Gauge, Timer } from 'lucide-react';
import type { LlmContextLogEntry, LlmContextTelemetry } from '../types/workbench';

interface ContextMonitorRailProps {
  telemetry: LlmContextTelemetry;
  logs: LlmContextLogEntry[];
  nowMs: number;
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatNumber(value?: number): string {
  if (value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString();
}

export function ContextMonitorRail({
  telemetry,
  logs,
  nowMs,
}: ContextMonitorRailProps) {
  const liveElapsedMs =
    telemetry.isThinking && telemetry.startedAtMs
      ? Math.max(0, nowMs - telemetry.startedAtMs)
      : telemetry.durationMs;

  const badgeStyle =
    telemetry.phase === 'Thinking'
      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30'
      : telemetry.phase === 'Ready'
        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
        : telemetry.phase === 'Error'
          ? 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30'
          : 'bg-slate-200/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-slate-300/70 dark:border-slate-700/70';

  const dotColor =
    telemetry.phase === 'Thinking'
      ? 'bg-sky-500 animate-pulse'
      : telemetry.phase === 'Ready'
        ? 'bg-emerald-500'
        : telemetry.phase === 'Error'
          ? 'bg-red-500'
          : 'bg-slate-400';

  return (
    <aside
      aria-label="LLM Context Monitor (Read-only)"
      className="hidden lg:flex w-72 shrink-0 flex-col border-l border-slate-200/80 dark:border-slate-800/80 bg-white/55 dark:bg-slate-900/55 backdrop-blur-xl p-3 gap-2.5 select-text overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-1 pt-0.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--pa-accent)' }} />
            <h2 className="text-xs font-semibold tracking-tight text-slate-900 dark:text-slate-100 truncate">
              LLM Context Monitor
            </h2>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            Read-only live runtime inspector
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 ${badgeStyle}`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} aria-hidden="true" />
          <span>{telemetry.phase}</span>
        </span>
      </div>

      {/* Live Progress Card */}
      <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/75 px-3 py-2.5 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
            <Timer className="w-3.5 h-3.5 text-slate-400" />
            <span>{telemetry.isThinking ? 'Thinking...' : 'Generation Progress'}</span>
          </span>
          <span className="font-mono text-[11px] font-semibold text-slate-800 dark:text-slate-200">
            {formatDuration(liveElapsedMs)}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-200/80 dark:bg-slate-800 overflow-hidden">
          {telemetry.isThinking ? (
            <div
              className="h-full w-2/5 rounded-full animate-pulse"
              style={{
                backgroundColor: 'var(--pa-accent)',
                animation: 'pulse 1.1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
              }}
            />
          ) : telemetry.phase === 'Ready' ? (
            <div className="h-full w-full rounded-full bg-emerald-500/85" />
          ) : telemetry.phase === 'Error' ? (
            <div className="h-full w-full rounded-full bg-red-500/85" />
          ) : (
            <div className="h-full w-0 rounded-full" />
          )}
        </div>
      </div>

      {/* 2x3 Read-Only Telemetry Grid */}
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 px-2.5 py-2">
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
            Prompt Size
          </div>
          <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
            {telemetry.promptChars > 0
              ? `${telemetry.promptChars.toLocaleString()} ch · ${telemetry.historyTurnsUsed}t`
              : '—'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 px-2.5 py-2">
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
            Tokens Loaded
          </div>
          <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
            {formatNumber(telemetry.totalTokens)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 px-2.5 py-2">
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
            Input Tokens
          </div>
          <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
            {formatNumber(telemetry.inputTokens)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 px-2.5 py-2">
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
            Output Tokens
          </div>
          <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
            {formatNumber(telemetry.outputTokens)}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 px-2.5 py-2">
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Gauge className="w-3 h-3" />
            <span>Speed</span>
          </div>
          <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
            {telemetry.tokensPerSecond !== undefined
              ? `${telemetry.tokensPerSecond.toFixed(1)} tok/s`
              : '—'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 px-2.5 py-2">
          <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Cpu className="w-3 h-3" />
            <span>Time Taken</span>
          </div>
          <div className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 mt-0.5 truncate">
            {formatDuration(liveElapsedMs)}
          </div>
        </div>
      </div>

      {/* Status / Errors Box */}
      <div
        className={`rounded-xl border px-3 py-2 text-[11px] ${
          telemetry.lastError
            ? 'border-red-300/80 dark:border-red-900/80 bg-red-50/80 dark:bg-red-950/35 text-red-700 dark:text-red-300'
            : 'border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 text-slate-600 dark:text-slate-300'
        }`}
      >
        <div className="flex items-center gap-1.5 font-semibold text-[10px] uppercase tracking-wide opacity-80 mb-0.5">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>Status / Errors</span>
        </div>
        <div className="leading-snug break-words line-clamp-3">
          {telemetry.lastError || 'Healthy · No active errors'}
        </div>
      </div>

      {/* Limited Moving LLM Context Logs */}
      <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200/70 dark:border-slate-800/70 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
            Context Events
          </span>
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
            {logs.length}/12 max
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 space-y-1.5">
          {logs.length === 0 ? (
            <div className="text-[11px] text-slate-400 dark:text-slate-500 italic px-1 py-2">
              Waiting for LLM context activity...
            </div>
          ) : (
            logs.map((entry) => {
              const dotClass =
                entry.level === 'success'
                  ? 'bg-emerald-500'
                  : entry.level === 'error'
                    ? 'bg-red-500'
                    : 'bg-sky-500';
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 text-[11px] leading-snug rounded-md px-1.5 py-1 bg-slate-50/70 dark:bg-slate-950/40 border border-slate-200/50 dark:border-slate-800/60"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${dotClass}`}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-[10.5px] text-slate-700 dark:text-slate-300 break-words min-w-0">
                    <span className="text-slate-400 dark:text-slate-500">[{entry.timestamp}]</span>{' '}
                    {entry.message}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}
