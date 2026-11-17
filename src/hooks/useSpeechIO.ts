import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceConfig } from '../types/workbench';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export interface UseSpeechIOResult {
  speechRecognitionSupported: boolean;
  speechSynthesisSupported: boolean;
  isListening: boolean;
  interimTranscript: string;
  micLevel: number;
  micError: string | null;
  voices: SpeechSynthesisVoice[];
  speakingTurnId: string | null;
  startListening: (onFinalTranscript: (text: string) => void) => Promise<void>;
  stopListening: () => void;
  speakText: (turnId: string, text: string) => void;
  stopSpeaking: () => void;
  clearMicError: () => void;
}

function stripMarkdownForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[#*_~>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useSpeechIO(voiceConfig: VoiceConfig, isMuted: boolean): UseSpeechIOResult {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speakingTurnId, setSpeakingTurnId] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const speechRecognitionSupported =
    typeof window !== 'undefined' && getSpeechRecognitionCtor() !== null;
  const speechSynthesisSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!speechSynthesisSupported) return;

    const syncVoices = () => {
      const available = window.speechSynthesis.getVoices();
      setVoices(available);
    };

    syncVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', syncVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', syncVoices);
    };
  }, [speechSynthesisSupported]);

  const cleanupAudioMeter = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    setMicLevel(0);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // Ignore stop error
      }
      recognitionRef.current = null;
    }
    cleanupAudioMeter();
    setIsListening(false);
    setInterimTranscript('');
  }, [cleanupAudioMeter]);

  useEffect(() => {
    if (isMuted && isListening) {
      stopListening();
    }
  }, [isMuted, isListening, stopListening]);

  useEffect(() => {
    return () => {
      stopListening();
      if (speechSynthesisSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopListening, speechSynthesisSupported]);

  const startListening = useCallback(
    async (onFinalTranscript: (text: string) => void) => {
      setMicError(null);
      if (isMuted) {
        setMicError('Microphone is muted in the top menu bar. Unmute to speak.');
        return;
      }

      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor) {
        setMicError(
          'Speech recognition is unavailable in this browser. Use Chromium/Edge on Windows or type your prompt below.',
        );
        return;
      }

      stopListening();

      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaStreamRef.current = stream;
          const AudioCtx =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            audioCtxRef.current = ctx;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);

            const tick = () => {
              analyser.getByteFrequencyData(data);
              let sum = 0;
              for (let i = 0; i < data.length; i += 1) {
                sum += data[i];
              }
              const avg = sum / data.length / 255;
              setMicLevel(Math.min(1, avg * 2.2));
              rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
          }
        }
      } catch (err) {
        setMicError(
          err instanceof Error
            ? `Microphone access denied: ${err.message}`
            : 'Microphone permission denied.',
        );
        return;
      }

      const recognition = new Ctor();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      let finalCollected = '';

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const segment = result[0]?.transcript || '';
          if (result.isFinal) {
            finalCollected += `${segment} `;
          } else {
            interim += segment;
          }
        }
        setInterimTranscript((finalCollected + interim).trim());
      };

      recognition.onerror = (event) => {
        if (event.error !== 'aborted' && event.error !== 'no-speech') {
          setMicError(`Microphone recognition error: ${event.error}`);
        }
        stopListening();
      };

      recognition.onend = () => {
        const finalized = finalCollected.trim();
        cleanupAudioMeter();
        setIsListening(false);
        setInterimTranscript('');
        recognitionRef.current = null;
        if (finalized) {
          onFinalTranscript(finalized);
        }
      };

      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    },
    [cleanupAudioMeter, isMuted, stopListening],
  );

  const stopSpeaking = useCallback(() => {
    if (!speechSynthesisSupported) return;
    window.speechSynthesis.cancel();
    setSpeakingTurnId(null);
  }, [speechSynthesisSupported]);

  const speakText = useCallback(
    (turnId: string, text: string) => {
      if (!speechSynthesisSupported) return;

      if (speakingTurnId === turnId) {
        window.speechSynthesis.cancel();
        setSpeakingTurnId(null);
        return;
      }

      window.speechSynthesis.cancel();
      const cleanText = stripMarkdownForSpeech(text);
      if (!cleanText) return;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = voiceConfig.rate;
      utterance.pitch = voiceConfig.pitch;

      if (voiceConfig.selectedVoiceURI) {
        const matched = voices.find((v) => v.voiceURI === voiceConfig.selectedVoiceURI);
        if (matched) {
          utterance.voice = matched;
        }
      }

      utterance.onend = () => {
        setSpeakingTurnId((current) => (current === turnId ? null : current));
      };
      utterance.onerror = () => {
        setSpeakingTurnId((current) => (current === turnId ? null : current));
      };

      setSpeakingTurnId(turnId);
      window.speechSynthesis.speak(utterance);
    },
    [speakingTurnId, speechSynthesisSupported, voiceConfig.pitch, voiceConfig.rate, voiceConfig.selectedVoiceURI, voices],
  );

  return {
    speechRecognitionSupported,
    speechSynthesisSupported,
    isListening,
    interimTranscript,
    micLevel,
    micError,
    voices,
    speakingTurnId,
    startListening,
    stopListening,
    speakText,
    stopSpeaking,
    clearMicError: () => setMicError(null),
  };
}
