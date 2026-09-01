import { useEffect, useRef, useState } from 'react';
import { useDeckStore } from '../store/deckStore';
import { exportDeckToPptx } from '../lib/exportPptx';
import { exportDeckToPdf } from '../lib/exportPdf';
import { importPptxFile } from '../lib/importPptx';

export function TopBar() {
  const deck = useDeckStore((s) => s.deck);
  const renameDeck = useDeckStore((s) => s.renameDeck);
  const setDeck = useDeckStore((s) => s.setDeck);
  const persist = useDeckStore((s) => s.persist);
  const importInput = useRef<HTMLInputElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<'pptx' | 'pdf' | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onClickAway = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    window.addEventListener('mousedown', onClickAway);
    return () => window.removeEventListener('mousedown', onClickAway);
  }, [exportMenuOpen]);

  const handleExport = async (format: 'pptx' | 'pdf') => {
    setExportMenuOpen(false);
    setExporting(format);
    try {
      persist();
      if (format === 'pptx') await exportDeckToPptx(deck);
      else await exportDeckToPdf(deck);
    } finally {
      setExporting(null);
    }
  };

  const handleImportFile = async (file: File) => {
    setImporting(true);
    try {
      const imported = await importPptxFile(file);
      setDeck(imported);
    } catch (err) {
      console.error(err);
      alert('Could not read that file. Please choose a valid .pptx file.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <header className="flor-topbar">
      <div className="flor-topbar__brand">
        <img src="/icons/flor-mark.svg" alt="" className="flor-topbar__logo" />
        <span className="flor-topbar__name">Flor</span>
      </div>

      <input
        className="flor-topbar__title"
        value={deck.name}
        onChange={(e) => renameDeck(e.target.value)}
        aria-label="Presentation name"
      />

      <div className="flor-topbar__actions">
        <input
          ref={importInput}
          type="file"
          accept=".pptx"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
            e.target.value = '';
          }}
        />
        <button className="flor-btn" onClick={() => importInput.current?.click()} disabled={importing}>
          {importing ? 'Importing…' : 'Import .pptx'}
        </button>
        <div className="flor-export-dropdown" ref={exportMenuRef}>
          <button
            className="flor-btn flor-btn--primary"
            onClick={() => setExportMenuOpen((v) => !v)}
            disabled={exporting !== null}
          >
            {exporting ? `Exporting ${exporting}…` : '⬇ Export ▾'}
          </button>
          {exportMenuOpen && (
            <div className="flor-export-menu">
              <button onClick={() => handleExport('pptx')}>
                <strong>PowerPoint</strong>
                <span>.pptx — editable in PowerPoint, Keynote, Slides</span>
              </button>
              <button onClick={() => handleExport('pdf')}>
                <strong>PDF</strong>
                <span>.pdf — fixed layout, ready to share or print</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
