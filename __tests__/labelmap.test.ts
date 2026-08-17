import { parseLabelmap } from '../src/logic/labelmap';

describe('parseLabelmap', () => {
  it('splits lines and trims whitespace', () => {
    expect(parseLabelmap('person\nbicycle\ncar\n')).toEqual([
      'person',
      'bicycle',
      'car',
    ]);
  });

  it('drops empty lines', () => {
    expect(parseLabelmap('person\n\nbicycle\n')).toEqual(['person', 'bicycle']);
  });

  it('drops unused "???" placeholder entries from the raw labelmap', () => {
    expect(parseLabelmap('???\nperson\n???\nbicycle\n')).toEqual([
      'person',
      'bicycle',
    ]);
  });
});
