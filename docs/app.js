'use strict';

// Fill in a free key from https://openrouteservice.org/dev/#/signup for
// Naviguer to work — same requirement as the native app.
const ORS_API_KEY = 'REPLACE_WITH_YOUR_OPENROUTESERVICE_KEY';

// ---------- Speech ----------
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  speechSynthesis.speak(utterance);
}
function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// ---------- Haptics ----------
function pulse(intensity) {
  if (!('vibrate' in navigator)) return;
  const ms = intensity === 'heavy' ? 80 : intensity === 'medium' ? 40 : 15;
  navigator.vibrate(ms);
}

// ---------- Beep ----------
let audioCtx = null;
function playBeep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.09);
  } catch {
    // Web Audio unavailable — beep is a nice-to-have, not required.
  }
}

// ---------- Router ----------
const screens = {
  home: document.getElementById('screen-home'),
  navigate: document.getElementById('screen-navigate'),
  obstacles: document.getElementById('screen-obstacles'),
  describe: document.getElementById('screen-describe'),
};
let currentScreen = 'home';

function showScreen(name) {
  stopObstacles();
  stopDescribe();
  if (currentScreen === 'navigate' && name !== 'navigate') stopNavigate();
  screens[currentScreen].classList.remove('active');
  screens[name].classList.add('active');
  currentScreen = name;
  if (name === 'obstacles') startObstacles();
  if (name === 'describe') startDescribe();
  if (name === 'navigate') speak('Mode Naviguer. Entrez une destination à la voix ou au clavier, puis appuyez sur Démarrer.');
  if (name === 'obstacles') speak('Mode Obstacles');
  if (name === 'describe') speak('Mode Décrire. Appuyez sur le bouton pour décrire ce qui vous entoure.');
  if (name === 'home') stopSpeaking();
}

document.querySelectorAll('[data-nav]').forEach((el) => {
  el.addEventListener('click', () => showScreen(el.dataset.nav));
});

// ================= NAVIGATE =================
const destinationInput = document.getElementById('destination-input');
const navMicBtn = document.getElementById('nav-mic-btn');
const navStartBtn = document.getElementById('nav-start-btn');
const navInstruction = document.getElementById('nav-instruction');
const navStatus = document.getElementById('nav-status');

let navWatchId = null;
let navGpsWatchdog = null;
let navLastFixAt = 0;
let navHasWarnedSignalLoss = false;
let navRouteSteps = [];
let navRoutePolyline = [];
let navCurrentStepIndex = 0;
let navPreWarnedStep = -1;
let navIsRecalculating = false;
let navDestinationQuery = '';

const FALLBACK_WALKING_SPEED_MPS = 1.4;
const TURN_WARNING_SECONDS = 5;
const GPS_SIGNAL_TIMEOUT_MS = 15000;
const GPS_SIGNAL_CHECK_INTERVAL_MS = 5000;

async function fetchWalkingRoute(origin, destinationQuery) {
  const geoRes = await fetch(
    `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(destinationQuery)}&size=1`
  );
  if (!geoRes.ok) throw new Error('geocode failed');
  const geoJson = await geoRes.json();
  const dest = geoJson?.features?.[0]?.geometry?.coordinates;
  if (!dest) throw new Error('no geocoding result');
  const [destLon, destLat] = dest;

  const dirRes = await fetch(
    `https://api.openrouteservice.org/v2/directions/foot-walking?api_key=${ORS_API_KEY}&start=${origin.longitude},${origin.latitude}&end=${destLon},${destLat}`
  );
  if (!dirRes.ok) throw new Error('directions failed');
  const dirJson = await dirRes.json();
  const segments = dirJson?.features?.[0]?.properties?.segments?.[0]?.steps;
  const coordinates = dirJson?.features?.[0]?.geometry?.coordinates;
  if (!segments || !coordinates) throw new Error('no walking route');

  const steps = segments.map((step) => {
    const [lon, lat] = coordinates[step.way_points[0]];
    return { instruction: step.instruction, location: { latitude: lat, longitude: lon } };
  });
  const polyline = coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  return { steps, polyline };
}

function showNavInstruction(text) {
  navInstruction.textContent = text;
  navInstruction.style.display = text ? 'block' : 'none';
}

async function recalculateRoute(current) {
  if (navIsRecalculating) return;
  navIsRecalculating = true;
  speak("Écart par rapport à l'itinéraire. Recalcul en cours.");
  try {
    const route = await fetchWalkingRoute(current, navDestinationQuery);
    navRouteSteps = route.steps;
    navRoutePolyline = route.polyline;
    navCurrentStepIndex = 0;
    showNavInstruction(route.steps[0]?.instruction ?? 'Nouvel itinéraire introuvable.');
    speak(route.steps[0]?.instruction ?? 'Nouvel itinéraire introuvable.');
  } catch {
    speak("Impossible de recalculer l'itinéraire. Vérifiez votre connexion.");
  } finally {
    navIsRecalculating = false;
  }
}

function onLocationUpdate(position) {
  navLastFixAt = Date.now();
  navHasWarnedSignalLoss = false;

  const current = { latitude: position.coords.latitude, longitude: position.coords.longitude };
  const nextStep = navRouteSteps[navCurrentStepIndex + 1];

  if (nextStep && shouldRecalculateRoute(current, nextStep.location) === false) {
    navCurrentStepIndex += 1;
    showNavInstruction(nextStep.instruction);
    pulse('medium');
    speak(nextStep.instruction);
    return;
  }

  if (nextStep && navPreWarnedStep !== navCurrentStepIndex) {
    const speed = position.coords.speed != null && position.coords.speed > 0.1
      ? position.coords.speed
      : FALLBACK_WALKING_SPEED_MPS;
    const eta = estimateSecondsToArrival(distanceInMeters(current, nextStep.location), speed);
    if (eta <= TURN_WARNING_SECONDS) {
      navPreWarnedStep = navCurrentStepIndex;
      pulse('light');
    }
  }

  if (navRoutePolyline.length > 0) {
    const nearest = findNearestPoint(current, navRoutePolyline);
    if (shouldRecalculateRoute(current, nearest)) {
      recalculateRoute(current);
    }
  }
}

function stopNavigate() {
  if (navWatchId != null) navigator.geolocation.clearWatch(navWatchId);
  navWatchId = null;
  if (navGpsWatchdog != null) clearInterval(navGpsWatchdog);
  navGpsWatchdog = null;
}

navStartBtn.addEventListener('click', async () => {
  const destination = destinationInput.value.trim();
  if (!destination) return;
  stopNavigate();
  navDestinationQuery = destination;
  navPreWarnedStep = -1;
  navHasWarnedSignalLoss = false;
  navStartBtn.disabled = true;
  navStatus.textContent = 'Calcul de l’itinéraire…';

  if (!('geolocation' in navigator)) {
    speak('La géolocalisation n’est pas disponible sur cet appareil.');
    navStartBtn.disabled = false;
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const origin = { latitude: position.coords.latitude, longitude: position.coords.longitude };
        const route = await fetchWalkingRoute(origin, destination);
        navRouteSteps = route.steps;
        navRoutePolyline = route.polyline;
        navCurrentStepIndex = 0;
        showNavInstruction(route.steps[0]?.instruction ?? 'Itinéraire introuvable.');
        speak(route.steps[0]?.instruction ?? 'Itinéraire introuvable.');
        navStatus.textContent = 'Navigation en cours.';

        navLastFixAt = Date.now();
        navWatchId = navigator.geolocation.watchPosition(onLocationUpdate, () => {}, {
          enableHighAccuracy: true,
          maximumAge: 2000,
        });
        navGpsWatchdog = setInterval(() => {
          if (Date.now() - navLastFixAt > GPS_SIGNAL_TIMEOUT_MS && !navHasWarnedSignalLoss) {
            navHasWarnedSignalLoss = true;
            speak('Signal GPS perdu. Nouvelle tentative en cours.');
          }
        }, GPS_SIGNAL_CHECK_INTERVAL_MS);
      } catch {
        speak("Impossible de calculer l'itinéraire. Vérifiez votre connexion et réessayez.");
        navStatus.textContent = '';
      } finally {
        navStartBtn.disabled = false;
      }
    },
    () => {
      speak('Autorisation de localisation refusée. Activez-la dans les réglages de votre navigateur.');
      navStartBtn.disabled = false;
    },
    { enableHighAccuracy: true }
  );
});

// Voice destination input via the Web Speech API.
const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let navRecognition = null;
let navListening = false;

if (SpeechRecognitionCtor) {
  navRecognition = new SpeechRecognitionCtor();
  navRecognition.lang = 'fr-FR';
  navRecognition.interimResults = false;
  navRecognition.maxAlternatives = 1;
  navRecognition.onresult = (event) => {
    const transcript = event.results?.[0]?.[0]?.transcript;
    if (transcript) destinationInput.value = transcript;
  };
  navRecognition.onend = () => {
    navListening = false;
    navMicBtn.classList.remove('listening');
    navMicBtn.textContent = '🎤';
  };
  navRecognition.onerror = () => {
    speak('Reconnaissance vocale impossible. Réessayez ou tapez votre destination.');
  };
} else {
  navMicBtn.disabled = true;
  navMicBtn.title = 'Non disponible sur ce navigateur';
}

navMicBtn.addEventListener('click', () => {
  if (!navRecognition) return;
  if (navListening) {
    navRecognition.stop();
    return;
  }
  navListening = true;
  navMicBtn.classList.add('listening');
  navMicBtn.textContent = '■';
  navRecognition.start();
});

// ================= OBSTACLES =================
const obstaclesVideo = document.getElementById('obstacles-video');
const obstaclesStatus = document.getElementById('obstacles-status');
let obstaclesStream = null;
let obstaclesModel = null;
let obstaclesLoopId = null;
let obstaclesLastFrameAt = 0;
let obstaclesPreviousLevel = 'far';
let obstaclesEmptyFrameCount = 0;
let obstaclesBeepFrameCounter = 0;
const OBSTACLES_FRAME_INTERVAL_MS = 200; // ~5fps, matching the native app
const OBSTACLES_SCORE_THRESHOLD = 0.6;
const OBSTACLES_NO_DETECTION_RESET_FRAMES = 10;

async function startObstacles() {
  obstaclesStatus.textContent = 'Chargement du modèle de détection…';
  try {
    obstaclesStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
  } catch {
    obstaclesStatus.textContent = '';
    speak("Autorisation caméra refusée. Activez-la dans les réglages de votre navigateur.");
    return;
  }
  obstaclesVideo.srcObject = obstaclesStream;
  await obstaclesVideo.play();

  if (!obstaclesModel) {
    try {
      obstaclesModel = await cocoSsd.load();
    } catch {
      obstaclesStatus.textContent = '';
      speak("Impossible de charger la détection d'obstacles. Réessayez.");
      return;
    }
  }
  obstaclesStatus.textContent = '';
  obstaclesPreviousLevel = 'far';
  obstaclesEmptyFrameCount = 0;
  obstaclesLoopId = requestAnimationFrame(obstaclesLoop);
}

async function obstaclesLoop(timestamp) {
  if (currentScreen !== 'obstacles') return;
  if (timestamp - obstaclesLastFrameAt < OBSTACLES_FRAME_INTERVAL_MS) {
    obstaclesLoopId = requestAnimationFrame(obstaclesLoop);
    return;
  }
  obstaclesLastFrameAt = timestamp;

  try {
    const predictions = await obstaclesModel.detect(obstaclesVideo);
    const top = predictions
      .filter((p) => p.score > OBSTACLES_SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score)[0];

    if (top) {
      obstaclesEmptyFrameCount = 0;
      const [x, y, w, h] = top.bbox;
      const boxHeightRatio = h / obstaclesVideo.videoHeight;
      const horizontalCenter = (x + w / 2) / obstaclesVideo.videoWidth;
      const level = getProximityLevel(boxHeightRatio);

      if (shouldAnnounce(obstaclesPreviousLevel, level)) {
        const frenchLabel = translateLabel(top.class);
        const direction = describeDirection(horizontalCenter);
        speak(`${frenchLabel}, ${direction}${level === 'close' ? ', proche' : ''}`);
      }
      pulse(getHapticIntensity(level));
      obstaclesBeepFrameCounter += 1;
      if (shouldBeep(level, obstaclesBeepFrameCounter)) playBeep();
      obstaclesPreviousLevel = level;
    } else {
      obstaclesEmptyFrameCount += 1;
      if (obstaclesEmptyFrameCount >= OBSTACLES_NO_DETECTION_RESET_FRAMES) {
        obstaclesPreviousLevel = 'far';
      }
    }
  } catch {
    // A single failed detection pass isn't fatal — just skip this frame.
  }

  obstaclesLoopId = requestAnimationFrame(obstaclesLoop);
}

function stopObstacles() {
  if (obstaclesLoopId != null) cancelAnimationFrame(obstaclesLoopId);
  obstaclesLoopId = null;
  if (obstaclesStream) {
    obstaclesStream.getTracks().forEach((t) => t.stop());
    obstaclesStream = null;
  }
}

// ================= DESCRIBE =================
const describeVideo = document.getElementById('describe-video');
const describeCanvas = document.getElementById('describe-canvas');
const describeCaptureBtn = document.getElementById('describe-capture-btn');
const describeStatus = document.getElementById('describe-status');
let describeStream = null;
let describeBusy = false;

const hasFaceDetector = 'FaceDetector' in window;
const faceDetector = hasFaceDetector ? new window.FaceDetector({ fastMode: true }) : null;

async function startDescribe() {
  try {
    describeStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });
  } catch {
    speak('Autorisation caméra refusée. Activez-la dans les réglages de votre navigateur.');
    return;
  }
  describeVideo.srcObject = describeStream;
  await describeVideo.play();
}

function stopDescribe() {
  if (describeStream) {
    describeStream.getTracks().forEach((t) => t.stop());
    describeStream = null;
  }
}

describeCaptureBtn.addEventListener('click', async () => {
  if (describeBusy || !describeStream) return;
  describeBusy = true;
  describeCaptureBtn.textContent = '…';
  describeStatus.textContent = 'Analyse en cours…';

  try {
    describeCanvas.width = describeVideo.videoWidth;
    describeCanvas.height = describeVideo.videoHeight;
    const ctx = describeCanvas.getContext('2d');
    ctx.drawImage(describeVideo, 0, 0);

    const [ocrResult, faces] = await Promise.all([
      Tesseract.recognize(describeCanvas, 'fra').then((r) => r.data.text).catch(() => ''),
      hasFaceDetector
        ? faceDetector.detect(describeCanvas).catch(() => [])
        : Promise.resolve([]),
    ]);

    speak(composeDescription({ recognizedText: ocrResult, faceCount: faces.length }));
  } catch {
    speak("Impossible d'analyser l'image. Réessayez.");
  } finally {
    describeBusy = false;
    describeCaptureBtn.textContent = 'Décrire';
    describeStatus.textContent = '';
  }
});

// ---------- Service worker (offline shell) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
