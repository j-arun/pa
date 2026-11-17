import {
  AlertCircle,
  ArrowUp,
  Check,
  Cloud,
  Copy,
  Hourglass,
  Lock,
  Mic,
  MicOff,
  RotateCcw,
  Settings as SettingsIcon,
  Square,
  Volume2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import type {
  ConversationScope,
  ConversationTurn,
  WorkbenchSettings,
} from '../types/workbench';
import type { UseSpeechIOResult } from '../hooks/useSpeechIO';
import { MessageContent } from './MessageContent';

const CLOUD_BACKDROP_SRC = '/src/assets/images/cloud_workbench_sky_1794900004855.jpg';

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

interface WorkbenchPageProps {
  scope: ConversationScope;
  settings: WorkbenchSettings;
  turns: ConversationTurn[];
  isSending: boolean;
  isMuted: boolean;
  speech: UseSpeechIOResult;
  onSendMessage: (text: string, inputMode: 'text' | 'voice') => void;
  onClearConversation: () => void;
  onOpenSettings: () => void;
  onToggleMute: () => void;
}

export function WorkbenchPage({
  scope,
  settings,
  turns,
  isSending,
  isMuted,
  speech,
  onSendMessage,
  onClearConversation,
  onOpenSettings,
  onToggleMute,
}: WorkbenchPageProps) {
  const [draft, setDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [backdropError, setBackdropError] = useState(false);

  const ladderEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeAdapterLabel =
    scope === 'private'
      ? `Windows Ollama${
          settings.privateLlm.selectedModel
            ? ` · ${settings.privateLlm.selectedModel}`
            : ' · No model selected'
        }`
      : `${
          settings.publicLlm.activeAdapter === 'gemini'
            ? 'Gemini'
            : settings.publicLlm.activeAdapter === 'claude'
              ? 'Claude'
              : 'Fable'
        } · ${settings.publicLlm.adapters[settings.publicLlm.activeAdapter].model}`;

  const privateNeedsModel =
    scope === 'private' && !settings.privateLlm.selectedModel.trim();

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

  const handleMicToggle = () => {
    if (speech.isListening) {
      speech.stopListening();
      return;
    }
    if (isMuted) {
      onToggleMute();
      return;
    }
    void speech.startListening((finalText) => {
      if (finalText.trim()) {
        onSendMessage(finalText.trim(), 'voice');
      }
    });
  };

  const handleCopy = (id: string, text: string) => {
    void navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1600);
  };

  return (
    <div className="relative flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Cloud Sky Atmospheric Backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {!backdropError ? (
          <img
            src={CLOUD_BACKDROP_SRC}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setBackdropError(true)}
            className="w-full h-full object-cover opacity-35 dark:opacity-15 scale-105"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-b from-sky-50/75 via-white/75 to-slate-100/90 dark:from-slate-950/80 dark:via-slate-900/85 dark:to-slate-950/95" />
      </div>

      {/* Workspace Routing Toolbar */}
      <div className="relative z-10 flex items-center justify-between gap-4 px-6 py-3 border-b border-slate-200/75 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md">
        <div className="flex items-center gap-2.5 min-w-0 text-sm">
          {scope === 'private' ? (
            <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          ) : (
            <Cloud className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
          )}
          <span className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
            {scope === 'private' ? 'Private Conversation' : 'Public Conversation'}
          </span>
          <span className="text-slate-400 dark:text-slate-500" aria-hidden="true">
            ·
          </span>
          <span className="text-slate-600 dark:text-slate-300 truncate">
            {activeAdapterLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {privateNeedsModel && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-700/80 bg-amber-50/90 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors whitespace-nowrap shrink-0"
            >
              Select Ollama Model
            </button>
          )}
          {turns.length > 0 && (
            <button
              type="button"
              onClick={onClearConversation}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200/90 dark:border-slate-700/80 bg-white/80 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>New Session</span>
            </button>
          )}
        </div>
      </div>

      {/* Continual Conversational Cloud Ladder */}
      <div className="relative z-10 flex-1 overflow-y-auto fluent-scroll px-4 sm:px-8 py-6">
        <div className="max-w-4xl mx-auto min-h-full flex flex-col justify-end gap-5">
          {turns.length === 0 ? (
            <div className="my-auto py-8">
              <div className="cloud-surface rounded-3xl border border-white/80 dark:border-slate-700/70 shadow-sm p-8 sm:p-10 text-center max-w-2xl mx-auto">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-sky-500/10 dark:bg-sky-400/10 text-sky-600 dark:text-sky-400 mb-5">
                  {scope === 'private' ? (
                    <Lock className="w-7 h-7" />
                  ) : (
                    <Cloud className="w-7 h-7" />
                  )}
                </div>

                <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 text-balance">
                  {scope === 'private'
                    ? 'Private Local Assistant Cloud'
                    : 'Public Assistant Adapter Cloud'}
                </h1>

                <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
                  {scope === 'private'
                    ? 'Speak or type below. Your prompts route directly to your local Windows Ollama model and stay on your machine.'
                    : `Speak or type below. Your prompts route through the ${
                        settings.publicLlm.activeAdapter === 'gemini'
                          ? 'Gemini'
                          : settings.publicLlm.activeAdapter === 'claude'
                            ? 'Claude'
                            : 'Fable'
                      } adapter and can be read aloud with your native Windows speaker.`}
                </p>

                <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2 flex-wrap">
                  <span>Mode: {scope === 'private' ? 'Private (Ollama)' : 'Public Adapter'}</span>
                  <span aria-hidden="true">·</span>
                  <span>Input: Keyboard or Microphone</span>
                  <span aria-hidden="true">·</span>
                  <span>Voice Output: Native OS Speaker</span>
                </div>

                <div className="mt-5 flex justify-center">
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/85 dark:bg-slate-800/85 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <SettingsIcon className="w-3.5 h-3.5" />
                    <span>Configure Models & Local Config Before Starting</span>
                  </button>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-2.5 text-left">
                  {STARTER_PROMPTS[scope].map((promptText, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onSendMessage(promptText, 'text')}
                      className="w-full px-4 py-3 rounded-xl border border-slate-200/85 dark:border-slate-700/75 bg-white/75 dark:bg-slate-800/65 hover:bg-sky-50/70 dark:hover:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-between gap-3"
                    >
                      <span className="truncate">{promptText}</span>
                      <ArrowUp className="w-4 h-4 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            turns.map((turn) => {
              const timeLabel = new Date(turn.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              if (turn.role === 'user') {
                return (
                  <motion.div
                    key={turn.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[82%] sm:max-w-[72%] rounded-2xl rounded-br-md px-5 py-3.5 bg-sky-600 dark:bg-sky-600 text-white shadow-sm">
                      <div className="flex items-center justify-end gap-2 text-[11px] text-sky-100/90 mb-1.5 tabular-nums">
                        <span>You</span>
                        <span aria-hidden="true">·</span>
                        <span>{turn.inputMode === 'voice' ? 'Voice' : 'Typed'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{turn.scope === 'private' ? 'Private' : 'Public'}</span>
                        <span aria-hidden="true">·</span>
                        <span>{timeLabel}</span>
                      </div>
                      <MessageContent text={turn.content} isUser />
                    </div>
                  </motion.div>
                );
              }

              if (turn.role === 'error') {
                return (
                  <motion.div
                    key={turn.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex justify-start"
                  >
                    <div className="max-w-[88%] sm:max-w-[78%] rounded-2xl rounded-bl-md px-5 py-4 border border-red-200 dark:border-red-900/70 bg-red-50/90 dark:bg-red-950/40 text-red-900 dark:text-red-200">
                      <div className="flex items-center gap-2 text-xs font-medium text-red-700 dark:text-red-300 mb-1.5">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>
                          {turn.scope === 'private' ? 'Private Adapter' : 'Public Adapter'} Error
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{turn.adapterId}</span>
                      </div>
                      <p className="text-sm leading-relaxed">{turn.content}</p>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={onOpenSettings}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 hover:bg-red-100/60 dark:hover:bg-red-900/40 transition-colors"
                        >
                          <SettingsIcon className="w-3.5 h-3.5" />
                          <span>Configure Adapter in Settings</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              }

              const isSpeakingThisTurn = speech.speakingTurnId === turn.id;
              const adapterTitle =
                turn.adapterId === 'ollama'
                  ? 'Windows Ollama'
                  : turn.adapterId === 'gemini'
                    ? 'Gemini'
                    : turn.adapterId === 'claude'
                      ? 'Claude'
                      : 'Fable';

              return (
                <motion.div
                  key={turn.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  className="flex justify-start"
                >
                  <div className="max-w-[88%] sm:max-w-[80%] cloud-surface rounded-2xl rounded-bl-md border border-white/90 dark:border-slate-700/75 shadow-sm px-5 py-4 text-slate-900 dark:text-slate-100">
                    <div className="flex items-center flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400 mb-2 tabular-nums">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {turn.scope === 'private' ? 'Private' : 'Public'} · {adapterTitle}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-[11px]">{turn.model}</span>
                      {typeof turn.durationMs === 'number' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{turn.durationMs} ms</span>
                        </>
                      )}
                      {typeof turn.tokenCount === 'number' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{turn.tokenCount} tokens</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{timeLabel}</span>
                    </div>

                    <MessageContent text={turn.content} />

                    <div className="mt-3.5 pt-2.5 border-t border-slate-200/70 dark:border-slate-700/60 flex items-center gap-2 flex-wrap">
                      {speech.speechSynthesisSupported && (
                        <button
                          type="button"
                          onClick={() => speech.speakText(turn.id, turn.content)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                            isSpeakingThisTurn
                              ? 'bg-sky-600 text-white hover:bg-sky-700'
                              : 'bg-slate-100/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-slate-700'
                          }`}
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
                        onClick={() => handleCopy(turn.id, turn.content)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200/80 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                      >
                        {copiedId === turn.id ? (
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
                </motion.div>
              );
            })
          )}

          {isSending && (
            <div className="flex justify-start">
              <div className="cloud-surface rounded-2xl rounded-bl-md border border-white/90 dark:border-slate-700/75 px-5 py-4 text-sm text-slate-600 dark:text-slate-300 inline-flex items-center gap-2.5">
                <Hourglass className="w-4 h-4 text-sky-600 dark:text-sky-400 animate-spin shrink-0" />
                <span>
                  Processing in{' '}
                  {scope === 'private'
                    ? `Private Windows Ollama${settings.privateLlm.selectedModel ? ` (${settings.privateLlm.selectedModel})` : ''}`
                    : `Public Adapter (${settings.publicLlm.activeAdapter})`}
                  ...
                </span>
              </div>
            </div>
          )}

          <div ref={ladderEndRef} />
        </div>
      </div>

      {/* Bottom Floating Cloud Input Dock */}
      <div className="relative z-10 px-4 sm:px-8 pb-5 pt-2">
        <div className="max-w-4xl mx-auto">
          {speech.micError && (
            <div className="mb-2.5 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
              <span>{speech.micError}</span>
              <button
                type="button"
                onClick={speech.clearMicError}
                className="font-medium underline whitespace-nowrap shrink-0"
              >
                Dismiss
              </button>
            </div>
          )}

          {speech.isListening && (
            <div className="mb-2.5 flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl cloud-surface border border-sky-300/80 dark:border-sky-700/70 text-xs text-slate-700 dark:text-slate-200">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-end gap-0.5 h-4 shrink-0" aria-hidden="true">
                  {[0.35, 0.65, 1, 0.75, 0.45].map((weight, i) => (
                    <span
                      key={i}
                      className="w-1 rounded-full bg-sky-600 dark:bg-sky-400 transition-transform duration-75"
                      style={{
                        height: `${Math.max(4, Math.round((0.25 + speech.micLevel * 0.75) * 16 * weight))}px`,
                      }}
                    />
                  ))}
                </div>
                <span className="truncate">
                  {speech.interimTranscript || 'Listening via microphone... speak your query.'}
                </span>
              </div>
              <button
                type="button"
                onClick={speech.stopListening}
                className="px-2.5 py-1 rounded-md bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium whitespace-nowrap shrink-0"
              >
                Stop
              </button>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="cloud-surface rounded-2xl border border-white/90 dark:border-slate-700/80 shadow-md p-2.5 flex items-end gap-2.5"
          >
            <button
              type="button"
              onClick={handleMicToggle}
              title={
                isMuted
                  ? 'Microphone muted (click to unmute)'
                  : speech.isListening
                    ? 'Stop listening'
                    : 'Speak using microphone'
              }
              aria-label={
                isMuted
                  ? 'Unmute microphone'
                  : speech.isListening
                    ? 'Stop voice input'
                    : 'Start voice input'
              }
              className={`h-11 w-11 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                isMuted
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                  : speech.isListening
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-slate-700'
              }`}
            >
              {isMuted ? (
                <MicOff className="w-5 h-5" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                scope === 'private'
                  ? 'Type or speak a private prompt for your Windows Ollama model...'
                  : `Type or speak a public prompt for ${settings.publicLlm.activeAdapter}...`
              }
              className="flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none max-h-36 leading-snug"
            />

            <button
              type="submit"
              disabled={!draft.trim() || isSending}
              className="h-11 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-45 disabled:pointer-events-none text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
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
