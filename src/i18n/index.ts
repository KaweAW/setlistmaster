import { en, type MessageKey } from './en';
import { it } from './it';
import { useUiStore } from '../state/uiStore';

export type Language = 'it' | 'en';
export type { MessageKey };

const dictionaries: Record<Language, Record<MessageKey, string>> = { en, it };

export function translate(
  lang: Language,
  key: MessageKey,
  params?: Record<string, string | number>,
): string {
  const template = dictionaries[lang][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
}

/** Typed translation hook; re-renders when the language changes. */
export function useT() {
  const lang = useUiStore((s) => s.language);
  return (key: MessageKey, params?: Record<string, string | number>) =>
    translate(lang, key, params);
}
