import { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Speech from 'expo-speech';

const PERMISSION_LABELS: Record<string, string> = {
  camera: 'caméra',
  location: 'localisation',
};

export default function PermissionsNeededScreen() {
  const { permission } = useLocalSearchParams<{ permission: string }>();
  const router = useRouter();
  const label = PERMISSION_LABELS[permission ?? ''] ?? 'requise';

  useEffect(() => {
    Speech.speak(
      `Autorisation ${label} manquante. Ouvrez les réglages pour l'activer, puis revenez.`,
      { language: 'fr-FR' }
    );
  }, [label]);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Autorisation {label} manquante.</Text>
      <Pressable
        style={styles.button}
        onPress={() => Linking.openSettings()}
        accessibilityRole="button"
        accessibilityLabel="Ouvrir les réglages"
      >
        <Text style={styles.buttonText}>Ouvrir les réglages</Text>
      </Pressable>
      <Pressable
        style={styles.button}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Retour"
      >
        <Text style={styles.buttonText}>Retour</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  text: { fontSize: 20, textAlign: 'center', marginBottom: 16 },
  button: { backgroundColor: '#1d4ed8', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
