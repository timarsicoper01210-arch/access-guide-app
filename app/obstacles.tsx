// app/obstacles.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  type Constraint,
} from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useResizer } from 'react-native-vision-camera-resizer';
import { NitroModules } from 'react-native-nitro-modules';
import { scheduleOnRN } from 'react-native-worklets';
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Battery from 'expo-battery';
import { useAudioPlayer } from 'expo-audio';
import {
  getProximityLevel,
  shouldAnnounce,
  getHapticIntensity,
  shouldBeep,
  type ProximityLevel,
} from '../src/logic/proximityThreshold';
import { parseLabelmapIndexed } from '../src/logic/labelmapIndexed';
import { translateLabel } from '../src/logic/labelTranslations';
import { generateBeepDataUri } from '../src/logic/beepSound';
import { useSpeech } from '../src/hooks/useSpeech';
import { useHaptics } from '../src/hooks/useHaptics';

const BEEP_DATA_URI = generateBeepDataUri();

const DETECTION_SCORE_THRESHOLD = 0.6;
// The camera is throttled to ~5fps so speech and haptics cannot flood the user.
const CAMERA_CONSTRAINTS: Constraint[] = [{ fps: 5 }];
// ~2s of consecutive empty frames at 5fps before we forget the last proximity
// level — long enough to ignore a single dropped-detection flicker, short
// enough that a genuinely departed obstacle doesn't silence the next one.
const NO_DETECTION_RESET_FRAMES = 10;
const LOW_BATTERY_THRESHOLD = 0.15;
const BATTERY_CHECK_INTERVAL_MS = 30000;
const DISCLAIMER_MARKER_FILENAME = 'obstacles-disclaimer-shown';

function describeDirection(horizontalCenter: number): string {
  if (horizontalCenter < 0.33) return 'à gauche';
  if (horizontalCenter > 0.66) return 'à droite';
  return 'devant';
}

export default function ObstaclesScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { resizer, state: resizerState } = useResizer({
    width: 300,
    height: 300,
    channelOrder: 'rgb',
    dataType: 'uint8',
    scaleMode: 'stretch',
    pixelLayout: 'interleaved',
  });
  const { speak, stop } = useSpeech();
  const { pulse } = useHaptics();
  const beepPlayer = useAudioPlayer(BEEP_DATA_URI);
  const previousLevelRef = useRef<ProximityLevel>('far');
  const emptyFrameCountRef = useRef(0);
  const beepFrameCounterRef = useRef(0);
  const hasWarnedResizeErrorRef = useRef(false);
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const marker = new File(Paths.document, DISCLAIMER_MARKER_FILENAME);
      if (!marker.exists) {
        speak(
          "Ceci est une aide complémentaire, pas un remplacement d'une canne blanche ou d'un chien guide. Mode Obstacles."
        );
        try {
          await marker.write('1');
        } catch {
          // Non-fatal: worst case the disclaimer repeats on the next launch.
        }
      } else {
        speak('Mode Obstacles');
      }
    })();
    return () => {
      stop();
    };
  }, [speak, stop]);

  useEffect(() => {
    let hasWarnedLowBattery = false;
    const checkBattery = async () => {
      const level = await Battery.getBatteryLevelAsync();
      if (level >= 0 && level < LOW_BATTERY_THRESHOLD && !hasWarnedLowBattery) {
        hasWarnedLowBattery = true;
        speak('Batterie faible. Pensez à fermer le mode Obstacles pour économiser votre batterie.');
      }
    };
    checkBattery();
    const interval = setInterval(checkBattery, BATTERY_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [speak]);

  useEffect(() => {
    (async () => {
      try {
        const asset = Asset.fromModule(require('../assets/models/labelmap.txt'));
        await asset.downloadAsync();
        const text = await new File(asset.localUri!).text();
        setLabels(parseLabelmapIndexed(text));
      } catch {
        speak("Impossible de charger la détection d'obstacles. Réessayez.");
      }
    })();
  }, [speak]);

  const plugin = useTensorflowModel(
    require('../assets/models/ssd_mobilenet_v1.tflite'),
    Platform.OS === 'ios' ? ['core-ml'] : []
  );
  const model = plugin.state === 'loaded' ? plugin.model : undefined;
  const boxedModel = useMemo(
    () => (model != null ? NitroModules.box(model) : undefined),
    [model]
  );

  useEffect(() => {
    if (plugin.state === 'error') {
      speak("Impossible de charger la détection d'obstacles. Réessayez.");
    }
  }, [plugin.state, speak]);

  useEffect(() => {
    if (resizerState === 'error') {
      speak("Impossible de préparer la détection d'obstacles. Réessayez.");
    }
  }, [resizerState, speak]);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().then((granted) => {
        if (!granted) {
          router.replace({ pathname: '/permissions-needed', params: { permission: 'camera' } });
        }
      });
    }
  }, [hasPermission, requestPermission, router]);

  const handleDetection = useCallback(
    (labelIndex: number, boxHeightRatio: number, horizontalCenter: number) => {
      emptyFrameCountRef.current = 0;
      const level = getProximityLevel(boxHeightRatio);
      if (shouldAnnounce(previousLevelRef.current, level)) {
        const englishLabel = labels[labelIndex] ?? 'object';
        const frenchLabel = translateLabel(englishLabel);
        const direction = describeDirection(horizontalCenter);
        speak(`${frenchLabel}, ${direction}${level === 'close' ? ', proche' : ''}`);
      }
      pulse(getHapticIntensity(level));
      beepFrameCounterRef.current += 1;
      if (shouldBeep(level, beepFrameCounterRef.current)) {
        beepPlayer.seekTo(0);
        beepPlayer.play();
      }
      previousLevelRef.current = level;
    },
    [beepPlayer, labels, pulse, speak]
  );

  // Debounced: without this reset, a stale 'close'/'near' memory would silence
  // every later obstacle once the current one leaves the frame. Requiring
  // several consecutive empty frames (rather than resetting on the first one)
  // avoids re-announcing the same obstacle when detection briefly flickers.
  const handleNoDetection = useCallback(() => {
    emptyFrameCountRef.current += 1;
    if (emptyFrameCountRef.current >= NO_DETECTION_RESET_FRAMES) {
      previousLevelRef.current = 'far';
    }
  }, []);

  // Some devices/environments (older GPUs, some emulators) can't satisfy the
  // resizer's AHardwareBuffer/Vulkan requirements per-frame even though the
  // resizer itself initialized successfully. Without this, that surfaces as
  // a silent, unbounded stream of console errors instead of telling the user
  // anything. Announced once, not per-frame.
  const handleResizeError = useCallback(() => {
    if (hasWarnedResizeErrorRef.current) return;
    hasWarnedResizeErrorRef.current = true;
    speak("Détection d'obstacles indisponible sur cet appareil.");
  }, [speak]);

  const frameOutput = useFrameOutput({
    // The GPU resizer requires a 'yuv' input frame on iOS.
    pixelFormat: 'yuv',
    onFrame: (frame) => {
      'worklet';
      try {
        if (boxedModel == null || resizer == null) return;
        const tflite = boxedModel.unbox();

        let resized;
        try {
          resized = resizer.resize(frame);
        } catch {
          scheduleOnRN(handleResizeError);
          return;
        }
        try {
          const pixels = resized.getPixelBuffer();
          const outputs = tflite.runSync([pixels]);
          const boxes = new Float32Array(outputs[0]!);
          const classes = new Float32Array(outputs[1]!);
          const scores = new Float32Array(outputs[2]!);
          const count = new Float32Array(outputs[3]!)[0] ?? 0;

          if (count > 0 && (scores[0] ?? 0) > DETECTION_SCORE_THRESHOLD) {
            const top = boxes.slice(0, 4); // [yMin, xMin, yMax, xMax], normalized
            const boxHeightRatio = Math.abs((top[2] ?? 0) - (top[0] ?? 0));
            const horizontalCenter = ((top[1] ?? 0) + (top[3] ?? 0)) / 2;
            const labelIndex = Math.round(classes[0] ?? -1);
            scheduleOnRN(handleDetection, labelIndex, boxHeightRatio, horizontalCenter);
          } else {
            scheduleOnRN(handleNoDetection);
          }
        } finally {
          resized.dispose();
        }
      } finally {
        frame.dispose();
      }
    },
  });

  if (!hasPermission || device == null || boxedModel == null || labels.length === 0 || resizer == null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        <Pressable
          style={styles.backButtonInline}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Text style={styles.backText}>Retour</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        isActive
        device={device}
        outputs={[frameOutput]}
        constraints={CAMERA_CONSTRAINTS}
      />
      <Pressable
        style={styles.backButton}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Retour"
      >
        <Text style={styles.backText}>Retour</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backButton: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  backButtonInline: {
    marginTop: 24,
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  backText: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
