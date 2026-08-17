import { translateLabel } from '../src/logic/labelTranslations';

describe('translateLabel', () => {
  it('translates a known COCO label to French', () => {
    expect(translateLabel('person')).toBe('personne');
    expect(translateLabel('bicycle')).toBe('vélo');
    expect(translateLabel('car')).toBe('voiture');
  });

  it('falls back to a generic term for unmapped labels', () => {
    expect(translateLabel('toothbrush')).toBe('obstacle');
  });
});
