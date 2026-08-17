export function parseLabelmap(rawText: string): string[] {
  return rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== '???');
}
