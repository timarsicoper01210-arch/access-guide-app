import { generateBeepDataUri } from '../src/logic/beepSound';

function decodeBase64ToBytes(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

describe('generateBeepDataUri', () => {
  it('returns a WAV data URI', () => {
    const uri = generateBeepDataUri();
    expect(uri.startsWith('data:audio/wav;base64,')).toBe(true);
  });

  it('produces a valid WAV header (RIFF/WAVE/fmt /data tags)', () => {
    const uri = generateBeepDataUri(1000, 80, 22050);
    const base64 = uri.replace('data:audio/wav;base64,', '');
    const bytes = decodeBase64ToBytes(base64);
    const ascii = (start: number, length: number) =>
      String.fromCharCode(...bytes.slice(start, start + length));

    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(ascii(36, 4)).toBe('data');
  });

  it('encodes the requested sample rate in the header', () => {
    const uri = generateBeepDataUri(1000, 80, 16000);
    const base64 = uri.replace('data:audio/wav;base64,', '');
    const bytes = decodeBase64ToBytes(base64);
    const sampleRate = bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16) | (bytes[27]! << 24);
    expect(sampleRate).toBe(16000);
  });

  it('produces roughly duration-ms worth of 16-bit mono samples', () => {
    const uri = generateBeepDataUri(1000, 100, 22050);
    const base64 = uri.replace('data:audio/wav;base64,', '');
    const bytes = decodeBase64ToBytes(base64);
    const dataSize = bytes[40]! | (bytes[41]! << 8) | (bytes[42]! << 16) | (bytes[43]! << 24);
    const expectedSamples = Math.floor((22050 * 100) / 1000);
    expect(dataSize).toBe(expectedSamples * 2);
    expect(bytes.length).toBe(44 + dataSize);
  });
});
