import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useCanEdit } from '../cloud/CloudProvider';
import { useData } from '../data/DataProvider';
import { SetlistEditor } from '../components/SetlistEditor';
import { SetlistSheet } from '../components/SetlistSheet';
import { Button, buttonClass } from '../components/ui';
import { StageToggle } from '../components/StageToggle';
import { useSetlistEditor } from '../hooks/useSetlistEditor';
import { useWakeLock } from '../hooks/useWakeLock';
import { useUiStore } from '../state/uiStore';
import { useT } from '../i18n';

export default function SetlistPage() {
  const { setlistId } = useParams();
  // Keyed by id: opening another setlist starts from a clean state.
  return <SetlistPageInner key={setlistId} setlistId={setlistId} />;
}

function SetlistPageInner({ setlistId }: { setlistId: string | undefined }) {
  const t = useT();
  const location = useLocation();
  const ed = useSetlistEditor(setlistId);
  const canEdit = useCanEdit(useData().band.id);
  const stage = useUiStore((s) => s.stageMode);
  useWakeLock(stage); // the setlist on the music stand must not go dark either
  // A brand-new setlist opens straight in edit mode; every other visit starts in the safe read-only view.
  const [editing, setEditing] = useState(() => (location.state as { edit?: boolean } | null)?.edit === true);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return; // let text fields undo natively
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) ed.redo();
        else ed.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, ed]);

  if (ed.status === 'loading') return <p className="p-6 text-soft">{t('app.loading')}</p>;
  if (ed.status === 'missing' || !ed.tree) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="text-soft">{t('setlist.notFound')}</p>
        <Link to="/" className={`${buttonClass('secondary')} mt-4`}>{t('common.back')}</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-3 py-3">
      {editing ? (
        <div className="sticky top-0 z-20 -mx-3 mb-3 flex items-center gap-2 border-b border-line bg-paper/95 px-3 py-2 backdrop-blur">
          <Button variant="secondary" disabled={!ed.canUndo} onClick={ed.undo}>↶ {t('setlist.undo')}</Button>
          <Button variant="secondary" disabled={!ed.canRedo} onClick={ed.redo}>↷ {t('setlist.redo')}</Button>
          <Button className="ml-auto" onClick={() => setEditing(false)}>{t('common.done')}</Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link to="/" className="inline-flex h-11 items-center text-sm font-semibold text-io">← {t('home.title')}</Link>
          <div className="flex flex-wrap gap-2">
            <StageToggle />
            {/* On stage nothing here can change the setlist or leave the page by accident. */}
            {!stage && (
              <>
                <Link to={`/setlist/${setlistId}/print`} className={buttonClass('secondary')}>
                  {t('setlist.exportPdf')}
                </Link>
                {canEdit && (
                  <Button
                    onClick={() => {
                      ed.resetHistory(); // undo only covers the current editing session
                      setEditing(true);
                    }}
                  >
                    {t('setlist.edit')}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {ed.saveError && (
        <p role="alert" className="my-2 rounded-md border border-lei/40 bg-lei/5 p-3 text-sm font-semibold text-lei">
          {t('setlist.saveError')}
        </p>
      )}

      {editing ? (
        <SetlistEditor
          tree={ed.tree}
          songs={ed.songs}
          performers={ed.performers}
          tunings={ed.tunings}
          apply={ed.apply}
          createSong={ed.createSong}
        />
      ) : (
        <SetlistSheet tree={ed.tree} songs={ed.songs} performers={ed.performers} tunings={ed.tunings} />
      )}
    </main>
  );
}
