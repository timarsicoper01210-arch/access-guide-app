import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import type { HapticIntensity } from '../logic/proximityThreshold';

const STYLE_MAP: Record<HapticIntensity, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

export function useHaptics() {
  const pulse = useCallback((intensity: HapticIntensity) => {
    Haptics.impactAsync(STYLE_MAP[intensity]);
  }, []);

  return { pulse };
}
