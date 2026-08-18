import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';

const MODES = [
  { key: 'navigate', label: 'Naviguer', description: "Itinéraire piéton guidé à la voix" },
  { key: 'obstacles', label: 'Obstacles', description: "Détection d'obstacles en temps réel" },
  { key: 'describe', label: 'Décrire', description: "Décrit ce que la caméra voit" },
] as const;

export default function HomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {MODES.map((mode) => (
        <Pressable
          key={mode.key}
          onPress={() => router.push(`/${mode.key}`)}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel={`${mode.label}. ${mode.description}`}
        >
          <Text style={styles.buttonText}>{mode.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 16, gap: 16 },
  button: {
    flex: 1,
    backgroundColor: '#1d4ed8',
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 32, fontWeight: '700' },
});
