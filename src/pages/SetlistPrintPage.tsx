import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PrintPages } from '../components/PrintPages';
import { useSetlistEditor } from '../hooks/useSetlistEditor';
import { useT } from '../i18n';

export default function SetlistPrintPage() {
  const { setlistId } = useParams();
  return <SetlistPrintInner key={setlistId} setlistId={setlistId} />;
}

function SetlistPrintInner({ setlistId }: { setlistId: string | undefined }) {
  const t = useT();
  const ed = useSetlistEditor(setlistId);
  const setlist = ed.tree?.setlist;

  // Browsers propose the page title as the PDF file name.
  useEffect(() => {
    if (!setlist) return;
    const previous = document.title;
    document.title = [setlist.title, setlist.date].filter(Boolean).join(' ');
    return () => {
      document.title = previous;
    };
  }, [setlist]);

  const button =
    'h-11 rounded-md bg-paper px-5 text-[15px] font-semibold text-ink hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-io';

  return (
    <div className="pp-root force-light">
      <div className="pp-toolbar">
        <Link to={setlistId ? `/setlist/${setlistId}` : '/'} className={`${button} inline-flex items-center`}>
          ← {t('common.back')}
        </Link>
        <button type="button" className={button} onClick={() => window.print()} disabled={!ed.tree}>
          {t('print.print')}
        </button>
        <span className="max-w-md text-center text-xs text-chrome-ink/70">{t('print.hint')}</span>
      </div>

      {ed.status === 'loading' && <p className="p-6 text-soft">{t('app.loading')}</p>}
      {ed.status === 'missing' && <p className="p-6 text-soft">{t('setlist.notFound')}</p>}
      {ed.tree && (
        <PrintPages tree={ed.tree} songs={ed.songs} performers={ed.performers} tunings={ed.tunings} />
      )}
    </div>
  );
}
