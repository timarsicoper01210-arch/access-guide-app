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
import { File } from 'expo-file-system';
import {
  getProximityLevel,
  shouldAnnounce,
  getHapticIntensity,
  type ProximityLevel,
} from '../src/logic/proximityThreshold';
import { parseLabelmapIndexed } from '../src/logic/labelmapIndexed';
import { translateLabel } from '../src/logic/labelTranslations';
import { useSpeech } from '../src/hooks/useSpeech';
import { useHaptics } from '../src/hooks/useHaptics';

const DETECTION_SCORE_THRESHOLD = 0.6;
// The camera is throttled to ~5fps so speech and haptics cannot flood the user.
const CAMERA_CONSTRAINTS: Constraint[] = [{ fps: 5 }];

function describeDirection(horizontalCenter: number): string {
  if (horizontalCenter < 0.33) return 'à gauche';
  if (horizontalCenter > 0.66) return 'à droite';
  return 'devant';
}

export default function ObstaclesScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { resizer } = useResizer({
    width: 300,
    height: 300,
    channelOrder: 'rgb',
    dataType: 'uint8',
    scaleMode: 'stretch',
    pixelLayout: 'interleaved',
  });
  const { speak, stop } = useSpeech();
  const { pulse } = useHaptics();
  const previousLevelRef = useRef<ProximityLevel>('far');
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    speak('Mode Obstacles');
    return () => {
      stop();
    };
  }, [speak, stop]);

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
      const level = getProximityLevel(boxHeightRatio);
      if (shouldAnnounce(previousLevelRef.current, level)) {
        const englishLabel = labels[labelIndex] ?? 'object';
        const frenchLabel = translateLabel(englishLabel);
        const direction = describeDirection(horizontalCenter);
        speak(`${frenchLabel}, ${direction}${level === 'close' ? ', proche' : ''}`);
      }
      pulse(getHapticIntensity(level));
      previousLevelRef.current = level;
    },
    [labels, pulse, speak]
  );

  // Without this reset, a stale 'close'/'near' memory would silence every later
  // obstacle once the current one leaves the frame.
  const handleNoDetection = useCallback(() => {
    previousLevelRef.current = 'far';
  }, []);

  const frameOutput = useFrameOutput({
    // The GPU resizer requires a 'yuv' input frame on iOS.
    pixelFormat: 'yuv',
    onFrame: (frame) => {
      'worklet';
      try {
        if (boxedModel == null || resizer == null) return;
        const tflite = boxedModel.unbox();

        const resized = resizer.resize(frame);
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

  if (!hasPermission || device == null || boxedModel == null || labels.length === 0) {
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
