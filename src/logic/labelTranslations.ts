const LABEL_TRANSLATIONS_FR: Record<string, string> = {
  person: 'personne',
  bicycle: 'vélo',
  car: 'voiture',
  motorcycle: 'moto',
  bus: 'bus',
  train: 'train',
  truck: 'camion',
  'traffic light': 'feu de circulation',
  'fire hydrant': 'borne à incendie',
  'stop sign': 'panneau stop',
  bench: 'banc',
  dog: 'chien',
  cat: 'chat',
  backpack: 'sac à dos',
  umbrella: 'parapluie',
  handbag: 'sac à main',
  suitcase: 'valise',
  chair: 'chaise',
  couch: 'canapé',
  'potted plant': 'plante',
  bed: 'lit',
  'dining table': 'table',
  toilet: 'toilettes',
  door: 'porte',
};

export function translateLabel(englishLabel: string): string {
  return LABEL_TRANSLATIONS_FR[englishLabel] ?? 'obstacle';
}
