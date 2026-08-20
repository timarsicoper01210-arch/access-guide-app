import { parseLabelmapIndexed } from '../src/logic/labelmapIndexed';

describe('parseLabelmapIndexed', () => {
  it('keeps "???" placeholders so positions match the model class indices', () => {
    expect(parseLabelmapIndexed('???\nperson\n???\nbicycle\n')).toEqual([
      '???',
      'person',
      '???',
      'bicycle',
      '',
    ]);
  });

  it('keeps a label at the same index as in the raw labelmap', () => {
    const labels = parseLabelmapIndexed('???\nperson\n???\nbicycle\n');
    expect(labels[1]).toBe('person');
    expect(labels[3]).toBe('bicycle');
  });

  it('keeps empty lines so later labels do not shift', () => {
    expect(parseLabelmapIndexed('person\n\nbicycle')).toEqual([
      'person',
      '',
      'bicycle',
    ]);
  });

  it('trims surrounding whitespace and carriage returns from each line', () => {
    expect(parseLabelmapIndexed('  person \r\n\tbicycle  ')).toEqual([
      'person',
      'bicycle',
    ]);
  });
});
