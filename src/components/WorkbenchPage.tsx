import {
  AlertCircle,
  ArrowUp,
  Check,
  Cloud,
  Copy,
  FileDown,
  Hourglass,
  Lock,
  RotateCcw,
  Settings as SettingsIcon,
  Square,
  Volume2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConversationScope,
  ConversationTurn,
  WorkbenchSettings,
} from '../types/workbench';
import type { UseSpeechIOResult } from '../hooks/useSpeechIO';
import { exportConversationToPdf } from '../utils/pdfExport';
import { MessageContent } from './MessageContent';

const STARTER_PROMPTS: Record<ConversationScope, string[]> = {
  private: [
    'Summarize my morning priorities and draft a clean checklist for today.',
    'Explain how to inspect running Ollama models and GPU memory on Windows.',
    'Write a concise PowerShell script to archive log files older than 14 days.',
  ],
  public: [
    'Compare local-first AI privacy trade-offs against cloud reasoning models.',
    'Draft a clear project update email for a cross-functional engineering review.',
    'Break down a clean WinUI 3 MVVM adapter architecture for multiple LLM backends.',
  ],
};

interface ConversationExchange {
  id: string;
  questionTurn: ConversationTurn | null;
  replyTurn: ConversationTurn | null;
}

interface WorkbenchPageProps {
  scope: ConversationScope;
  settings: WorkbenchSettings;
  turns: ConversationTurn[];
  isSending: boolean;
  speech: UseSpeechIOResult;
  onSendMessage: (text: string, inputMode: 'text') => void;
  onClearConversation: () => void;
  onOpenSettings: () => void;
}

function ScopeArtwork({
  scope,
  className,
}: {
  scope: ConversationScope;
  className: string;
}) {
  const isPrivate = scope === 'private';

  return (
    <div
      className={`pointer-events-none absolute ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 360 260" className="h-auto w-full">
        <circle cx="158" cy="130" r="115" fill="#dbeafe" />
        <path d="M66 248c5-49 37-77 86-77s81 28 86 77" fill="#2563eb" />
        <path
          d="M119 88c0-32 19-53 47-53 30 0 51 24 48 57l-4 38c-3 27-21 45-46 45-27 0-45-20-45-48z"
          fill="#f3c6a5"
        />
        <path
          d="M118 91c-5-40 18-68 53-68 29 0 48 19 49 48-15-5-26-16-31-30-13 18-39 30-71 30z"
          fill="#334155"
        />
        <circle cx="176" cy="105" r="3" fill="#334155" />
        <path d="M181 128c5 3 10 3 14 0" fill="none" stroke="#9a5d4a" strokeWidth="3" strokeLinecap="round" />
        {isPrivate ? (
          <g>
            <path
              d="M201 62h94a17 17 0 0 1 17 17v29a17 17 0 0 1-17 17h-38l-17 16v-16h-39a17 17 0 0 1-17-17V79a17 17 0 0 1 17-17z"
              fill="#fff"
              stroke="#60a5fa"
              strokeWidth="4"
            />
            <circle cx="228" cy="94" r="4" fill="#60a5fa" />
            <circle cx="247" cy="94" r="4" fill="#60a5fa" />
            <circle cx="266" cy="94" r="4" fill="#60a5fa" />
            <path d="M201 143c-10 5-15 13-16 22" fill="none" stroke="#60a5fa" strokeWidth="4" strokeLinecap="round" />
          </g>
        ) : (
          <g>
            <path
              d="M197 91h28l47-27v81l-47-27h-28z"
              fill="#f59e0b"
              stroke="#b45309"
              strokeWidth="4"
              strokeLinejoin="round"
            />
            <path d="M213 118l10 34h19l-13-41" fill="#d97706" />
            <path
              d="M282 79c15 12 15 36 0 48M296 66c24 20 24 54 0 74"
              fill="none"
              stroke="#2563eb"
              strokeWidth="5"
              strokeLinecap="round"
            />
          </g>
        )}
      </svg>
    </div>
  );
}

export function WorkbenchPage({
  scope,
  settings,
  turns,
  isSending,
  speech,
  onSendMessage,
  onClearConversation,
  onOpenSettings,
}: WorkbenchPageProps) {
  const [draft, setDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  const ladderEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const privateNeedsModel =
    scope === 'private' && !settings.privateLlm.selectedModel.trim();

  const exchanges = useMemo<ConversationExchange[]>(() => {
    const grouped: ConversationExchange[] = [];
    let current: ConversationExchange | null = null;

    for (const turn of turns) {
      if (turn.role === 'user' || !current) {
        current = {
          id: turn.id,
          questionTurn: turn.role === 'user' ? turn : null,
          replyTurn: turn.role === 'user' ? null : turn,
        };
        grouped.push(current);
      } else {
        current.replyTurn = turn;
        current = null;
      }
    }

    return grouped;
  }, [turns]);

  useEffect(() => {
    ladderEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns.length, isSending]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = draft.trim();
    if (!cleaned || isSending) return;
    setDraft('');
    onSendMessage(cleaned, 'text');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600);
  };

  const handleExportPdf = async () => {
    if (turns.length === 0) return;
    await exportConversationToPdf(turns);
    setPdfNotice('Conversation exported to PDF.');
    setTimeout(() => setPdfNotice(null), 2600);
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Plain Light Translucent Animated Mist Backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="pa-mist-a absolute -top-28 -left-24 w-[560px] h-[420px] rounded-full blur-3xl opacity-55 dark:opacity-20"
          style={{
            background:
              'radial-gradient(circle, rgba(125,211,252,0.28) 0%, rgba(255,255,255,0.08) 65%, transparent 100%)',
          }}
        />
        <div
          className="pa-mist-b absolute -bottom-24 -right-24 w-[520px] h-[380px] rounded-full blur-3xl opacity-50 dark:opacity-20"
          style={{
            background:
              'radial-gradient(circle, rgba(186,230,253,0.32) 0%, rgba(255,255,255,0.10) 60%, transparent 100%)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-white/35 to-white/60 dark:from-slate-950/35 dark:via-slate-900/25 dark:to-slate-950/45" />
      </div>

      {/* Continual Conversational Bubble Ladder */}
      <div className="relative z-10 flex-1 overflow-y-auto fluent-scroll px-4 sm:px-8 py-6">
        <div className="max-w-4xl mx-auto min-h-full flex flex-col justify-end gap-5">
          {exchanges.length === 0 ? (
            <div className="my-auto py-8">
              <div className="bg-white/50 dark:bg-slate-900/55 backdrop-blur-xl rounded-[28px] border border-white/85 dark:border-slate-700/60 shadow-[0_10px_36px_rgba(2,132,199,0.06)] p-8 sm:p-10 text-center max-w-2xl mx-auto">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-500/10 dark:bg-sky-400/10 text-sky-600 dark:text-sky-400 mb-5">
                  {scope === 'private' ? (
                    <Lock className="w-7 h-7" />
                  ) : (
                    <Cloud className="w-7 h-7" />
                  )}
                </div>

                <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 text-balance">
                  Personal Assistant
                </h1>

                <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
                  {scope === 'private'
                    ? 'Private mode · Your prompt stays with your local Ollama model. Type below to begin.'
                    : `Public mode · Your prompt goes to ${
                        settings.publicLlm.activeAdapter === 'gemini'
                          ? 'Gemini'
                          : settings.publicLlm.activeAdapter === 'claude'
                            ? 'Claude'
                            : 'Fable'
                      } through the cloud. Type below to begin.`}
                </p>

                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200/90 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/80 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <SettingsIcon className="w-3.5 h-3.5" />
                    <span>Configure Models &amp; Themes</span>
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-2.5 text-left">
                  {STARTER_PROMPTS[scope].map((promptText, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onSendMessage(promptText, 'text')}
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/70 bg-white/70 dark:bg-slate-800/60 hover:bg-sky-50/75 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-between gap-3"
                    >
                      <span className="truncate">{promptText}</span>
                      <ArrowUp className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            exchanges.map((ex, idx) => {
              const isLast = idx === exchanges.length - 1;
              const showWaiting = isSending && isLast && !ex.replyTurn;
              const replyTurn = ex.replyTurn;
              const isSpeakingThisTurn =
                replyTurn !== null && speech.speakingTurnId === replyTurn.id;

              return (
                <motion.div
                  key={ex.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex justify-start"
                >
                  <div
                    className="w-full max-w-3xl cloud-surface rounded-[28px] rounded-bl-lg border border-white/85 dark:border-slate-700/70 shadow-[0_10px_34px_rgba(2,132,199,0.07)] p-4 text-slate-900 dark:text-slate-100 space-y-2.5"
                    style={{ fontFamily: 'var(--pa-font-body)' }}
                  >
                    {/* User Question Section (Theme Question Color Code) */}
                    {ex.questionTurn && (
                      <div
                        className="rounded-2xl px-4 py-3 border-l-4"
                        style={{
                          backgroundColor: 'var(--pa-q-bg)',
                          borderLeftColor: 'var(--pa-q-accent)',
                        }}
                      >
                        <div
                          className="text-[11px] font-semibold mb-1 tabular-nums"
                          style={{ color: 'var(--pa-q-accent)' }}
                        >
                          You · {formatTime(ex.questionTurn.timestamp)}
                        </div>
                        <div className="text-[15px] font-medium leading-relaxed text-slate-900 dark:text-slate-100">
                          <MessageContent text={ex.questionTurn.content} />
                        </div>
                      </div>
                    )}

                    {/* In-Bubble Working / Thinking Indicator */}
                    {showWaiting && (
                      <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300 px-3 py-1.5">
                        <Hourglass
                          className="w-4 h-4 animate-spin shrink-0"
                          style={{ color: 'var(--pa-a-accent)' }}
                        />
                        <span>Thinking...</span>
                      </div>
                    )}

                    {/* Error Notice inside the Same Bubble */}
                    {replyTurn && replyTurn.role === 'error' && (
                      <div className="rounded-2xl bg-red-50/80 dark:bg-red-950/35 border border-red-200/80 dark:border-red-900/60 px-4 py-3 text-red-800 dark:text-red-200">
                        <div className="flex items-center gap-2 text-xs font-semibold mb-1 tabular-nums">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Error · {formatTime(replyTurn.timestamp)}</span>
                        </div>
                        <p className="text-sm leading-relaxed">{replyTurn.content}</p>
                        <button
                          type="button"
                          onClick={onOpenSettings}
                          className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 hover:bg-red-100/60 transition-colors"
                        >
                          <SettingsIcon className="w-3.5 h-3.5" />
                          <span>Configure in Settings</span>
                        </button>
                      </div>
                    )}

                    {/* Assistant Answer Section (Theme Answer Color Code) */}
                    {replyTurn && replyTurn.role === 'assistant' && (
                      <div
                        className="rounded-2xl px-4 py-3.5 border-l-4"
                        style={{
                          backgroundColor: 'var(--pa-a-bg)',
                          borderLeftColor: 'var(--pa-a-accent)',
                        }}
                      >
                        <div
                          className="text-[11px] font-semibold mb-1.5 tabular-nums"
                          style={{ color: 'var(--pa-a-accent)' }}
                        >
                          {replyTurn.scope === 'private' ? 'Private' : 'Public'} ·{' '}
                          {formatTime(replyTurn.timestamp)}
                        </div>

                        <MessageContent text={replyTurn.content} />

                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          {speech.speechSynthesisSupported && (
                            <button
                              type="button"
                              onClick={() =>
                                speech.speakText(replyTurn.id, replyTurn.content)
                              }
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                                isSpeakingThisTurn
                                  ? 'text-white'
                                  : 'bg-white/80 dark:bg-slate-800/85 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700'
                              }`}
                              style={
                                isSpeakingThisTurn
                                  ? { backgroundColor: 'var(--pa-a-accent)' }
                                  : undefined
                              }
                            >
                              {isSpeakingThisTurn ? (
                                <>
                                  <Square className="w-3.5 h-3.5 fill-current" />
                                  <span>Stop Speaker</span>
                                </>
                              ) : (
                                <>
                                  <Volume2 className="w-3.5 h-3.5" />
                                  <span>Play in Windows Speaker</span>
                                </>
                              )}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleCopy(replyTurn.id, replyTurn.content)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-white/75 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                          >
                            {copiedId === replyTurn.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })
          )}

          <div ref={ladderEndRef} />
        </div>
      </div>

      {/* Bottom Floating Bubble Input Dock (3x Prompt Space + Save PDF) */}
      <div className="relative z-10 px-4 sm:px-8 pb-5 pt-2">
        <div className="max-w-4xl mx-auto">
          {pdfNotice && (
            <div className="mb-2.5 px-4 py-2 rounded-2xl bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
              {pdfNotice}
            </div>
          )}

          {privateNeedsModel && (
            <div className="mb-2.5 flex items-center justify-between gap-3 px-4 py-2 rounded-2xl bg-amber-50/90 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
              <span>No Windows Ollama model selected yet.</span>
              <button
                type="button"
                onClick={onOpenSettings}
                className="font-medium underline whitespace-nowrap shrink-0"
              >
                Select Ollama Model
              </button>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="relative overflow-hidden cloud-surface rounded-[26px] border border-white/90 dark:border-slate-700/75 shadow-[0_12px_36px_rgba(15,23,42,0.08)] p-3 flex items-end gap-2.5"
          >
            <ScopeArtwork
              scope={scope}
              className="right-16 top-1/2 z-0 w-36 sm:w-44 -translate-y-1/2 opacity-20"
            />
            <textarea
              ref={textareaRef}
              rows={4}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                scope === 'private'
                  ? 'Type a private prompt... (Enter to send, Shift+Enter for new line)'
                  : 'Type a public prompt... (Enter to send, Shift+Enter for new line)'
              }
              style={{ fontFamily: 'var(--pa-font-body)' }}
              className="relative z-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none min-h-[116px] max-h-56 leading-relaxed"
            />

            <button
              type="button"
              onClick={() => void handleExportPdf()}
              disabled={turns.length === 0}
              title="Save Conversation as PDF"
              aria-label="Save Conversation as PDF"
              className="relative z-10 h-11 w-11 rounded-2xl flex items-center justify-center border border-slate-200/85 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
            >
              <FileDown className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClearConversation}
              disabled={turns.length === 0 || isSending}
              title="New Session"
              aria-label="New Session"
              className="relative z-10 h-11 w-11 rounded-2xl flex items-center justify-center border border-slate-200/85 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none transition-colors shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              type="submit"
              disabled={!draft.trim() || isSending}
              className="relative z-10 h-11 px-4 rounded-2xl bg-[var(--pa-accent)] hover:bg-[var(--pa-accent-hover)] disabled:opacity-45 disabled:pointer-events-none text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
            >
              {isSending ? (
                <>
                  <Hourglass className="w-4 h-4 animate-spin" />
                  <span>Working</span>
                </>
              ) : (
                <>
                  <span>Send</span>
                  <ArrowUp className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
