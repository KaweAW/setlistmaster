import { useMemo, useState } from 'react';
import { chordsOverWordsToChordPro } from '../core/chordsOverWords';
import { structureSections } from '../core/chordpro';
import { useT } from '../i18n';
import { Modal } from './Modal';
import { Button, Field, textareaClass } from './ui';

/** Paste "chords above the words" text, see the ChordPro it becomes, then replace or extend the song's text. */
export function ConvertDialog({
  existing,
  onApply,
  onClose,
}: {
  existing: string;
  onApply: (chordpro: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [pasted, setPasted] = useState('');
  const result = useMemo(() => structureSections(chordsOverWordsToChordPro(pasted)).text, [pasted]);
  const empty = result.trim() === '';

  return (
    <Modal title={t('convert.title')} onClose={onClose}>
      <div className="space-y-4">
        <Field label={t('convert.paste')} hint={t('convert.pasteHint')}>
          <textarea
            className={`${textareaClass} font-mono text-[14px]`}
            rows={8}
            spellCheck={false}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
          />
        </Field>
        <Field label={t('convert.result')}>
          <textarea className={`${textareaClass} bg-line/30 font-mono text-[14px]`} rows={8} readOnly value={result} />
        </Field>
        <div className="flex flex-wrap gap-3">
          <Button disabled={empty} onClick={() => onApply(result)}>{t('convert.replace')}</Button>
          <Button
            variant="secondary"
            disabled={empty}
            onClick={() => onApply(existing.trim() ? `${existing.trimEnd()}\n\n${result}` : result)}
          >
            {t('convert.append')}
          </Button>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        </div>
      </div>
    </Modal>
  );
}
