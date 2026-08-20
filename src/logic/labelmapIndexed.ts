// Parses a labelmap while preserving positional alignment with the model's raw
// class indices: placeholder ('???') and empty lines are kept, never filtered.
export function parseLabelmapIndexed(rawText: string): string[] {
  return rawText.split('\n').map((line) => line.trim());
}
