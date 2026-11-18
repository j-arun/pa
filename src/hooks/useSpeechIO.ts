import { useCallback, useEffect, useState } from 'react';
import type { VoiceConfig } from '../types/workbench';

export interface UseSpeechIOResult {
  speechSynthesisSupported: boolean;
  voices: SpeechSynthesisVoice[];
  speakingTurnId: string | null;
  speakText: (turnId: string, text: string) => void;
  stopSpeaking: () => void;
}

function stripMarkdownForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/[#*_~>-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useSpeechIO(voiceConfig: VoiceConfig): UseSpeechIOResult {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speakingTurnId, setSpeakingTurnId] = useState<string | null>(null);

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

  useEffect(() => {
    return () => {
      if (speechSynthesisSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [speechSynthesisSupported]);

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
    speechSynthesisSupported,
    voices,
    speakingTurnId,
    speakText,
    stopSpeaking,
  };
}
