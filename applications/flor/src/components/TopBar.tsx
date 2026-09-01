import { useRef, useState } from 'react';
import { useDeckStore } from '../store/deckStore';
import { exportDeckToPptx } from '../lib/exportPptx';
import { importPptxFile } from '../lib/importPptx';

export function TopBar() {
  const deck = useDeckStore((s) => s.deck);
  const renameDeck = useDeckStore((s) => s.renameDeck);
  const setDeck = useDeckStore((s) => s.setDeck);
  const persist = useDeckStore((s) => s.persist);
  const importInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      persist();
      await exportDeckToPptx(deck);
    } finally {
      setExporting(false);
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
        <button className="flor-btn flor-btn--primary" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting…' : '⬇ Download .pptx'}
        </button>
      </div>
    </header>
  );
}
