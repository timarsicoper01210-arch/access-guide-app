// app/navigate.tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import {
  shouldRecalculateRoute,
  findNearestPoint,
  distanceInMeters,
  estimateSecondsToArrival,
  type Coordinate,
} from '../src/logic/routeDeviation';
import { useSpeech } from '../src/hooks/useSpeech';
import { useHaptics } from '../src/hooks/useHaptics';

const ORS_API_KEY = 'REPLACE_WITH_YOUR_OPENROUTESERVICE_KEY';
// Used only as a fallback when the device doesn't report a GPS speed
// (e.g. simulators, or a brief signal dip) — a reasonable average walking pace.
const FALLBACK_WALKING_SPEED_MPS = 1.4;
const TURN_WARNING_SECONDS = 5;
const GPS_SIGNAL_TIMEOUT_MS = 15000;
const GPS_SIGNAL_CHECK_INTERVAL_MS = 5000;

interface RouteStep {
  instruction: string;
  location: Coordinate;
}

interface WalkingRoute {
  steps: RouteStep[];
  polyline: Coordinate[];
}

async function fetchWalkingRoute(
  origin: Coordinate,
  destinationQuery: string
): Promise<WalkingRoute> {
  const geocodeResponse = await fetch(
    `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(
      destinationQuery
    )}&size=1`
  );
  if (!geocodeResponse.ok) {
    throw new Error(`Geocoding failed with status ${geocodeResponse.status}`);
  }
  const geocodeJson = await geocodeResponse.json();
  const destination = geocodeJson?.features?.[0]?.geometry?.coordinates;
  if (destination == null) {
    throw new Error('No geocoding result for destination');
  }
  const [destLon, destLat] = destination;

  const directionsResponse = await fetch(
    `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${ORS_API_KEY}&start=${origin.longitude},${origin.latitude}&end=${destLon},${destLat}`
  );
  if (!directionsResponse.ok) {
    throw new Error(`Directions request failed with status ${directionsResponse.status}`);
  }
  const directionsJson = await directionsResponse.json();
  const segments = directionsJson?.features?.[0]?.properties?.segments?.[0]?.steps;
  const coordinates = directionsJson?.features?.[0]?.geometry?.coordinates;
  if (segments == null || coordinates == null) {
    throw new Error('No walking route found for destination');
  }

  const steps = segments.map((step: { instruction: string; way_points: [number, number] }) => {
    const [lon, lat] = coordinates[step.way_points[0]];
    return { instruction: step.instruction, location: { latitude: lat, longitude: lon } };
  });
  const polyline = coordinates.map(([lon, lat]: [number, number]) => ({
    latitude: lat,
    longitude: lon,
  }));

  return { steps, polyline };
}

export default function NavigateScreen() {
  const router = useRouter();
  const [destination, setDestination] = useState('');
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const { speak, stop } = useSpeech();
  const { pulse } = useHaptics();
  const watchSubscription = useRef<Location.LocationSubscription | null>(null);
  const currentStepIndexRef = useRef(0);
  const routeStepsRef = useRef<RouteStep[]>([]);
  const routePolylineRef = useRef<Coordinate[]>([]);
  const isRecalculatingRef = useRef(false);
  const destinationQueryRef = useRef('');
  const preWarnedStepRef = useRef(-1);
  const lastLocationUpdateAtRef = useRef(0);
  const hasWarnedSignalLossRef = useRef(false);
  const gpsWatchdogInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    speak('Mode Naviguer. Entrez une destination à la voix ou au clavier, puis appuyez sur Démarrer.');
    return () => {
      watchSubscription.current?.remove();
      if (gpsWatchdogInterval.current != null) clearInterval(gpsWatchdogInterval.current);
      ExpoSpeechRecognitionModule.stop();
      stop();
    };
  }, [speak, stop]);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript;
    if (transcript) {
      setDestination(transcript);
    }
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent('error', () => {
    setIsListening(false);
    speak('Reconnaissance vocale impossible. Réessayez ou tapez votre destination.');
  });

  const handleVoiceInput = useCallback(async () => {
    if (isListening) {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!result.granted) {
      speak('Autorisation microphone requise pour la saisie vocale.');
      return;
    }
    setIsListening(true);
    ExpoSpeechRecognitionModule.start({ lang: 'fr-FR' });
  }, [isListening, speak]);

  const recalculateRoute = useCallback(
    async (current: Coordinate) => {
      if (isRecalculatingRef.current) return;
      isRecalculatingRef.current = true;
      speak("Écart par rapport à l'itinéraire. Recalcul en cours.");
      try {
        const route = await fetchWalkingRoute(current, destinationQueryRef.current);
        routeStepsRef.current = route.steps;
        routePolylineRef.current = route.polyline;
        currentStepIndexRef.current = 0;
        setSteps(route.steps);
        setCurrentStepIndex(0);
        speak(route.steps[0]?.instruction ?? 'Nouvel itinéraire introuvable.');
      } catch {
        speak("Impossible de recalculer l'itinéraire. Vérifiez votre connexion.");
      } finally {
        isRecalculatingRef.current = false;
      }
    },
    [speak]
  );

  const handleLocationUpdate = useCallback(
    (update: Location.LocationObject) => {
      lastLocationUpdateAtRef.current = Date.now();
      hasWarnedSignalLossRef.current = false;

      const current: Coordinate = {
        latitude: update.coords.latitude,
        longitude: update.coords.longitude,
      };

      const nextStep = routeStepsRef.current[currentStepIndexRef.current + 1];
      if (nextStep && shouldRecalculateRoute(current, nextStep.location) === false) {
        currentStepIndexRef.current += 1;
        setCurrentStepIndex(currentStepIndexRef.current);
        pulse('medium');
        speak(nextStep.instruction);
        return;
      }

      // Short vibration ~5s before the upcoming turn, once per step — distinct
      // from the arrival pulse above, which fires when the waypoint is reached.
      if (nextStep && preWarnedStepRef.current !== currentStepIndexRef.current) {
        const speed =
          update.coords.speed != null && update.coords.speed > 0.1
            ? update.coords.speed
            : FALLBACK_WALKING_SPEED_MPS;
        const eta = estimateSecondsToArrival(
          distanceInMeters(current, nextStep.location),
          speed
        );
        if (eta <= TURN_WARNING_SECONDS) {
          preWarnedStepRef.current = currentStepIndexRef.current;
          pulse('light');
        }
      }

      if (routePolylineRef.current.length > 0) {
        const nearest = findNearestPoint(current, routePolylineRef.current);
        if (shouldRecalculateRoute(current, nearest)) {
          recalculateRoute(current);
        }
      }
    },
    [pulse, speak, recalculateRoute]
  );

  const handleStart = useCallback(async () => {
    watchSubscription.current?.remove();
    if (gpsWatchdogInterval.current != null) clearInterval(gpsWatchdogInterval.current);
    setIsLoading(true);
    destinationQueryRef.current = destination;
    preWarnedStepRef.current = -1;
    hasWarnedSignalLossRef.current = false;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        router.replace({ pathname: '/permissions-needed', params: { permission: 'location' } });
        return;
      }

      const position = await Location.getCurrentPositionAsync({});
      const origin: Coordinate = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      const route = await fetchWalkingRoute(origin, destination);
      routeStepsRef.current = route.steps;
      routePolylineRef.current = route.polyline;
      setSteps(route.steps);
      setCurrentStepIndex(0);
      currentStepIndexRef.current = 0;
      speak(route.steps[0]?.instruction ?? 'Itinéraire introuvable.');

      lastLocationUpdateAtRef.current = Date.now();
      watchSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 5 },
        handleLocationUpdate
      );
      gpsWatchdogInterval.current = setInterval(() => {
        const elapsed = Date.now() - lastLocationUpdateAtRef.current;
        if (elapsed > GPS_SIGNAL_TIMEOUT_MS && !hasWarnedSignalLossRef.current) {
          hasWarnedSignalLossRef.current = true;
          speak('Signal GPS perdu. Nouvelle tentative en cours.');
        }
      }, GPS_SIGNAL_CHECK_INTERVAL_MS);
    } catch {
      speak("Impossible de calculer l'itinéraire. Vérifiez votre connexion et réessayez.");
    } finally {
      setIsLoading(false);
    }
  }, [destination, router, speak, handleLocationUpdate]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Destination</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, styles.inputFlex]}
          value={destination}
          onChangeText={setDestination}
          placeholder="Adresse ou lieu"
          accessibilityLabel="Champ de saisie de la destination"
        />
        <Pressable
          style={[styles.micButton, isListening && styles.micButtonActive]}
          onPress={handleVoiceInput}
          accessibilityRole="button"
          accessibilityLabel={isListening ? "Arrêter l'écoute" : 'Dicter la destination à la voix'}
        >
          <Text style={styles.micButtonText}>{isListening ? '■' : '🎤'}</Text>
        </Pressable>
      </View>
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
      <Pressable
        style={styles.secondaryButton}
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
  container: { flex: 1, padding: 24, gap: 16, justifyContent: 'center' },
  label: { fontSize: 18, fontWeight: '600' },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  input: { borderWidth: 1, borderColor: '#94a3b8', borderRadius: 8, padding: 12, fontSize: 16 },
  inputFlex: { flex: 1 },
  micButton: {
    backgroundColor: '#334155',
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonActive: { backgroundColor: '#dc2626' },
  micButtonText: { fontSize: 20 },
  button: {
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#334155',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  instruction: { fontSize: 20, textAlign: 'center', marginTop: 16 },
});
