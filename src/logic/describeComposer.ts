export interface DescribeInput {
  recognizedText: string;
  faceCount: number;
}

export function composeDescription(input: DescribeInput): string {
  const parts: string[] = [];

  const trimmedText = input.recognizedText.trim();
  if (trimmedText.length > 0) {
    parts.push(`Texte détecté : "${trimmedText}".`);
  }

  if (input.faceCount === 1) {
    parts.push('1 visage détecté.');
  } else if (input.faceCount > 1) {
    parts.push(`${input.faceCount} visages détectés.`);
  }

  if (parts.length === 0) {
    return 'Rien de reconnaissable détecté.';
  }

  return parts.join(' ');
}
