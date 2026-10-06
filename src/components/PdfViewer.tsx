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

  return (
    <div ref={host} className="w-full">
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
              width={width}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="mb-3 shadow-[0_2px_10px_rgba(0,0,0,.2)]"
            />
          ))}
        </Document>
      )}
    </div>
  );
}
