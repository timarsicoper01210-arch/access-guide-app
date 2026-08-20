import {
  getProximityLevel,
  shouldAnnounce,
  getHapticIntensity,
  shouldBeep,
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

describe('shouldBeep', () => {
  it('never beeps when far', () => {
    expect(shouldBeep('far', 0)).toBe(false);
    expect(shouldBeep('far', 1)).toBe(false);
    expect(shouldBeep('far', 100)).toBe(false);
  });

  it('always beeps when close', () => {
    expect(shouldBeep('close', 0)).toBe(true);
    expect(shouldBeep('close', 1)).toBe(true);
    expect(shouldBeep('close', 7)).toBe(true);
  });

  it('beeps every other frame when near, producing a lower frequency than close', () => {
    expect(shouldBeep('near', 0)).toBe(true);
    expect(shouldBeep('near', 1)).toBe(false);
    expect(shouldBeep('near', 2)).toBe(true);
    expect(shouldBeep('near', 3)).toBe(false);
  });
});
