import { normalizeText } from '../core/songFilter';

/** Splits `text` where the search terms occur (ignoring case and accents), for marking them. */
export function splitMatches(text: string, terms: readonly string[]): { text: string; hit: boolean }[] {
  const wanted = terms.map((x) => normalizeText(x)).filter(Boolean);
  if (wanted.length === 0 || !text) return [{ text, hit: false }];
  // One plain character per original character, so indexes line up.
  const plain = [...text].map((c) => c.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’‘]/g, "'")[0] ?? c).join('');
  const marked = new Array<boolean>(text.length).fill(false);
  for (const w of wanted) {
    for (let at = plain.indexOf(w); at !== -1; at = plain.indexOf(w, at + 1)) for (let i = at; i < at + w.length; i++) marked[i] = true;
  }
  const out: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.hit === marked[i]) last.text += text[i]!;
    else out.push({ text: text[i]!, hit: marked[i]! });
  }
  return out;
}

/** Text with the searched words marked. */
export function Highlight({ text, terms }: { text: string; terms: readonly string[] }) {
  return (
    <>
      {splitMatches(text, terms).map((p, i) =>
        p.hit ? <mark key={i} className="rounded-sm bg-acc-tint px-[1px] text-inherit">{p.text}</mark> : p.text,
      )}
    </>
  );
}
