// app/obstacles.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
} from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { NitroModules } from 'react-native-nitro-modules';
import { scheduleOnRN } from 'react-native-worklets';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';
import {
  getProximityLevel,
  shouldAnnounce,
  getHapticIntensity,
  type ProximityLevel,
} from '../src/logic/proximityThreshold';
import { parseLabelmap } from '../src/logic/labelmap';
import { translateLabel } from '../src/logic/labelTranslations';
import { useSpeech } from '../src/hooks/useSpeech';
import { useHaptics } from '../src/hooks/useHaptics';

const DETECTION_SCORE_THRESHOLD = 0.6;

export default function ObstaclesScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const { resize } = useResizePlugin();
  const { speak } = useSpeech();
  const { pulse } = useHaptics();
  const previousLevelRef = useRef<ProximityLevel>('far');
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const asset = Asset.fromModule(require('../assets/models/labelmap.txt'));
      await asset.downloadAsync();
      const text = await FileSystem.readAsStringAsync(asset.localUri!);
      setLabels(parseLabelmap(text));
    })();
  }, []);

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
    if (!hasPermission) {
      requestPermission().then((granted) => {
        if (!granted) {
          router.replace({ pathname: '/permissions-needed', params: { permission: 'camera' } });
        }
      });
    }
  }, [hasPermission, requestPermission, router]);

  const handleDetection = useCallback(
    (labelIndex: number, boxHeightRatio: number) => {
      const level = getProximityLevel(boxHeightRatio);
      if (shouldAnnounce(previousLevelRef.current, level)) {
        const englishLabel = labels[labelIndex] ?? 'object';
        const frenchLabel = translateLabel(englishLabel);
        speak(`${frenchLabel}, ${level === 'close' ? 'proche' : 'devant'}`);
      }
      pulse(getHapticIntensity(level));
      previousLevelRef.current = level;
    },
    [labels, pulse, speak]
  );

  const frameOutput = useFrameOutput({
    pixelFormat: 'rgb',
    onFrame: (frame) => {
      'worklet';
      try {
        if (boxedModel == null) return;
        const tflite = boxedModel.unbox();

        const resized = resize(frame, {
          scale: { width: 300, height: 300 },
          pixelFormat: 'rgb',
          dataType: 'uint8',
        });
        const inputBuffer = resized.buffer.slice(
          resized.byteOffset,
          resized.byteOffset + resized.byteLength
        ) as ArrayBuffer;

        const outputs = tflite.runSync([inputBuffer]);
        const boxes = new Float32Array(outputs[0]!);
        const classes = new Float32Array(outputs[1]!);
        const scores = new Float32Array(outputs[2]!);
        const count = new Float32Array(outputs[3]!)[0] ?? 0;

        if (count > 0 && (scores[0] ?? 0) > DETECTION_SCORE_THRESHOLD) {
          const top = boxes.slice(0, 4); // [yMin, xMin, yMax, xMax], normalized
          const boxHeightRatio = Math.abs((top[2] ?? 0) - (top[0] ?? 0));
          const labelIndex = Math.round(classes[0] ?? -1);
          scheduleOnRN(handleDetection, labelIndex, boxHeightRatio);
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
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera style={StyleSheet.absoluteFill} isActive device={device} outputs={[frameOutput]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
