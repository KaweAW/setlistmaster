export interface TextRun {
  text: string;
  bold: boolean;
}

/** Splits "a **b** c" into runs. An unmatched `**` is kept as plain text. */
export function splitEmphasis(input: string): TextRun[] {
  const parts = input.split('**');
  if (parts.length % 2 === 0) return [{ text: input, bold: false }];
  return parts
    .map((text, i) => ({ text, bold: i % 2 === 1 }))
    .filter((run) => run.text.length > 0);
}
