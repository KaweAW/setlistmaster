import { useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useT } from '../i18n';

// The worker is bundled with the app (not fetched from a CDN) so charts open offline.
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

/**
 * PDF chart, all pages in a vertical scroll, scaled to the width of the screen.
 * Loaded lazily (default export) so the heavy pdf.js code stays out of the main bundle.
 */
export default function PdfViewer({ data }: { data: ArrayBuffer }) {
  const t = useT();
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState(0);
  const [failed, setFailed] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);

  // A blob URL (instead of handing pdf.js the bytes) survives React StrictMode remounts:
  // pdf.js transfers byte buffers to its worker, which would leave an empty copy behind.
  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [data]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Which page is in the middle of the screen, for the "2 / 5" in the bar.
  useEffect(() => {
    const el = host.current;
    if (!el || pages === 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setPage(Number((e.target as HTMLElement).dataset.pageNumber));
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    el.querySelectorAll('[data-page-number]').forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, [pages, zoom, width]);

  const step = (d: number) => setZoom((z) => Math.min(3, Math.max(0.6, Math.round((z + d) * 10) / 10)));
  const bar = 'h-9 min-w-9 rounded-full px-2 text-base font-semibold transition-colors hover:bg-white/15 active:bg-white/25 disabled:opacity-30';

  return (
    <div className="w-full">
      {pages > 0 && (
        <div className="pointer-events-none sticky top-[4.5rem] z-10 mb-2 flex justify-center">
          <div className="pointer-events-auto flex items-center gap-0.5 rounded-full bg-chrome/90 p-1 text-chrome-ink shadow-lg backdrop-blur" role="group" aria-label={t('pdf.controls')}>
            <button type="button" className={bar} aria-label={t('pdf.zoomOut')} disabled={zoom <= 0.6} onClick={() => step(-0.2)}>−</button>
            <button type="button" className={`${bar} min-w-[3.5rem] text-sm`} aria-label={t('pdf.fit')} onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button type="button" className={bar} aria-label={t('pdf.zoomIn')} disabled={zoom >= 3} onClick={() => step(0.2)}>+</button>
            <span className="mx-1 h-5 w-px bg-white/25" aria-hidden />
            <span className="px-2 text-sm font-semibold tabular-nums" aria-live="polite">{t('pdf.page', { n: page, total: pages })}</span>
          </div>
        </div>
      )}
      <div ref={host} className="w-full overflow-x-auto">
      {failed && <p role="alert" className="py-6 text-center font-semibold text-lei">{t('chart.pdfError')}</p>}
      {!failed && url && width > 0 && (
        <Document
          file={url}
          loading={<p className="py-6 text-center text-soft">{t('chart.loadingPdf')}</p>}
          error={null}
          onLoadSuccess={({ numPages }) => setPages(numPages)}
          onLoadError={() => setFailed(true)}
        >
          {Array.from({ length: pages }, (_, i) => (
            <Page
              key={i}
              pageNumber={i + 1}
              width={Math.round(width * zoom)}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="mb-3 shadow-[0_2px_10px_rgba(0,0,0,.2)]"
            />
          ))}
        </Document>
      )}
      </div>
    </div>
  );
}
