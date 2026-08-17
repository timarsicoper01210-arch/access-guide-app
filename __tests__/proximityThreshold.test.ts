import {
  getProximityLevel,
  shouldAnnounce,
  getHapticIntensity,
} from '../src/logic/proximityThreshold';

describe('getProximityLevel', () => {
  it('classifies small bounding boxes as far', () => {
    expect(getProximityLevel(0.1)).toBe('far');
  });

  it('classifies mid-size bounding boxes as near', () => {
    expect(getProximityLevel(0.3)).toBe('near');
  });

  it('classifies large bounding boxes as close', () => {
    expect(getProximityLevel(0.6)).toBe('close');
  });

  it('treats the near boundary (0.25) as near', () => {
    expect(getProximityLevel(0.25)).toBe('near');
  });

  it('treats the close boundary (0.5) as close', () => {
    expect(getProximityLevel(0.5)).toBe('close');
  });
});

describe('shouldAnnounce', () => {
  it('announces when proximity level increases', () => {
    expect(shouldAnnounce('far', 'near')).toBe(true);
    expect(shouldAnnounce('near', 'close')).toBe(true);
  });

  it('does not announce when level stays the same', () => {
    expect(shouldAnnounce('near', 'near')).toBe(false);
  });

  it('does not announce when level decreases', () => {
    expect(shouldAnnounce('close', 'near')).toBe(false);
  });
});

describe('getHapticIntensity', () => {
  it('maps far to light', () => {
    expect(getHapticIntensity('far')).toBe('light');
  });

  it('maps near to medium', () => {
    expect(getHapticIntensity('near')).toBe('medium');
  });

  it('maps close to heavy', () => {
    expect(getHapticIntensity('close')).toBe('heavy');
  });
});
