import { composeDescription } from '../src/logic/describeComposer';

describe('composeDescription', () => {
  it('returns fallback message when nothing detected', () => {
    expect(composeDescription({ recognizedText: '', faceCount: 0 })).toBe(
      'Rien de reconnaissable détecté.'
    );
  });

  it('describes detected text only', () => {
    expect(
      composeDescription({ recognizedText: 'Sortie de secours', faceCount: 0 })
    ).toBe('Texte détecté : "Sortie de secours".');
  });

  it('uses singular wording for exactly one face', () => {
    expect(composeDescription({ recognizedText: '', faceCount: 1 })).toBe(
      '1 visage détecté.'
    );
  });

  it('uses plural wording for multiple faces', () => {
    expect(composeDescription({ recognizedText: '', faceCount: 3 })).toBe(
      '3 visages détectés.'
    );
  });

  it('combines text and faces in one sentence', () => {
    expect(
      composeDescription({ recognizedText: 'Sortie de secours', faceCount: 2 })
    ).toBe('Texte détecté : "Sortie de secours". 2 visages détectés.');
  });
});
