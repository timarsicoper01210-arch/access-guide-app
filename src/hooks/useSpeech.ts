import { useCallback } from 'react';
import * as Speech from 'expo-speech';

export function useSpeech() {
  const speak = useCallback((text: string) => {
    Speech.speak(text, { language: 'fr-FR' });
  }, []);

  const stop = useCallback(() => {
    Speech.stop();
  }, []);

  return { speak, stop };
}
