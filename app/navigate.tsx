// app/navigate.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { shouldRecalculateRoute, type Coordinate } from '../src/logic/routeDeviation';
import { useSpeech } from '../src/hooks/useSpeech';
import { useHaptics } from '../src/hooks/useHaptics';

const ORS_API_KEY = 'REPLACE_WITH_YOUR_OPENROUTESERVICE_KEY';

interface RouteStep {
  instruction: string;
  location: Coordinate;
}

async function fetchWalkingRoute(
  origin: Coordinate,
  destinationQuery: string
): Promise<RouteStep[]> {
  const geocodeResponse = await fetch(
    `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(
      destinationQuery
    )}&size=1`
  );
  const geocodeJson = await geocodeResponse.json();
  const [destLon, destLat] = geocodeJson.features[0].geometry.coordinates;

  const directionsResponse = await fetch(
    `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${ORS_API_KEY}&start=${origin.longitude},${origin.latitude}&end=${destLon},${destLat}`
  );
  const directionsJson = await directionsResponse.json();
  const segments = directionsJson.features[0].properties.segments[0].steps;
  const coordinates = directionsJson.features[0].geometry.coordinates;

  return segments.map((step: { instruction: string; way_points: [number, number] }) => {
    const [lon, lat] = coordinates[step.way_points[0]];
    return { instruction: step.instruction, location: { latitude: lat, longitude: lon } };
  });
}

export default function NavigateScreen() {
  const router = useRouter();
  const [destination, setDestination] = useState('');
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const { speak } = useSpeech();
  const { pulse } = useHaptics();
  const watchSubscription = useRef<Location.LocationSubscription | null>(null);
  const currentStepIndexRef = useRef(0);

  useEffect(() => {
    return () => {
      watchSubscription.current?.remove();
    };
  }, []);

  const handleStart = useCallback(async () => {
    watchSubscription.current?.remove();
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      router.replace({ pathname: '/permissions-needed', params: { permission: 'location' } });
      return;
    }

    setIsLoading(true);
    try {
      const position = await Location.getCurrentPositionAsync({});
      const origin: Coordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const routeSteps = await fetchWalkingRoute(origin, destination);
      setSteps(routeSteps);
      setCurrentStepIndex(0);
      currentStepIndexRef.current = 0;
      speak(routeSteps[0]?.instruction ?? 'Itinéraire introuvable.');

      watchSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        (update) => {
          const current: Coordinate = {
            latitude: update.coords.latitude,
            longitude: update.coords.longitude,
          };
          const nextStep = routeSteps[currentStepIndexRef.current + 1];
          if (nextStep && shouldRecalculateRoute(current, nextStep.location) === false) {
            currentStepIndexRef.current += 1;
            setCurrentStepIndex(currentStepIndexRef.current);
            pulse('medium');
            speak(nextStep.instruction);
          }
        }
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentStepIndex, destination, pulse, router, speak]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Destination</Text>
      <TextInput
        style={styles.input}
        value={destination}
        onChangeText={setDestination}
        placeholder="Adresse ou lieu"
        accessibilityLabel="Champ de saisie de la destination"
      />
      <Pressable
        style={styles.button}
        onPress={handleStart}
        disabled={isLoading || destination.trim().length === 0}
        accessibilityRole="button"
        accessibilityLabel="Démarrer la navigation"
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Démarrer</Text>}
      </Pressable>
      {steps[currentStepIndex] && (
        <Text style={styles.instruction}>{steps[currentStepIndex].instruction}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  label: { fontSize: 18, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#94a3b8', borderRadius: 8, padding: 12, fontSize: 16 },
  button: {
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  instruction: { fontSize: 20, textAlign: 'center', marginTop: 16 },
});
