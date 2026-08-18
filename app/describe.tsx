// app/describe.tsx
import { useCallback, useEffect, useState } from 'react';
import { View, Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import { PhotoRecognizer } from 'react-native-vision-camera-ocr-plus';
import { useImageFaceDetector } from 'react-native-vision-camera-face-detector';
import { composeDescription } from '../src/logic/describeComposer';
import { useSpeech } from '../src/hooks/useSpeech';

export default function DescribeScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const photoOutput = usePhotoOutput();
  const [isProcessing, setIsProcessing] = useState(false);
  const { speak } = useSpeech();
  const faceDetector = useImageFaceDetector({ performanceMode: 'fast' });

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().then((granted) => {
        if (!granted) {
          router.replace({ pathname: '/permissions-needed', params: { permission: 'camera' } });
        }
      });
    }
  }, [hasPermission, requestPermission, router]);

  const handleCapture = useCallback(async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      const { filePath } = await photoOutput.capturePhotoToFile({}, {});
      const uri = `file://${filePath}`;

      const [ocrResult, faces] = await Promise.all([
        PhotoRecognizer({ uri, orientation: 'portrait' }),
        faceDetector.detectFaces(uri),
      ]);

      speak(
        composeDescription({
          recognizedText: ocrResult.resultText,
          faceCount: faces.length,
        })
      );
    } finally {
      setIsProcessing(false);
    }
  }, [faceDetector, isProcessing, photoOutput, speak]);

  if (!hasPermission || device == null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera style={StyleSheet.absoluteFill} isActive device={device} outputs={[photoOutput]} />
      <Pressable
        style={styles.captureButton}
        onPress={handleCapture}
        disabled={isProcessing}
        accessibilityRole="button"
        accessibilityLabel="Décrire ce que voit la caméra"
      >
        <Text style={styles.captureText}>{isProcessing ? '...' : 'Décrire'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  captureButton: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    backgroundColor: '#1d4ed8',
    borderRadius: 40,
    paddingVertical: 20,
    paddingHorizontal: 32,
  },
  captureText: { color: '#fff', fontSize: 22, fontWeight: '700' },
});
