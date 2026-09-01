import { useEffect, useRef } from 'react';
import { useDeckStore } from '../store/deckStore';
import { useLibraryStore } from '../store/libraryStore';
import { TEMPLATE_LAYOUTS } from '../lib/factory';
import { makeImage } from '../lib/factory';

export function LibraryPanel() {
  const addSlide = useDeckStore((s) => s.addSlide);
  const addElement = useDeckStore((s) => s.addElement);
  const activeSlideId = useDeckStore((s) => s.activeSlideId);
  const { assets, load, addAssetFromFile, removeAsset } = useLibraryStore();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flor-panel">
      <div className="flor-panel__header">
        <h3>Library</h3>
      </div>

      <div className="flor-lib-section">
        <h4>Layouts</h4>
        <div className="flor-lib-grid">
          {TEMPLATE_LAYOUTS.map((t) => (
            <button key={t.id} className="flor-lib-card" onClick={() => addSlide(t.build())}>
              <div className="flor-lib-card__preview" data-layout={t.id} />
              <span>{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flor-lib-section">
        <div className="flor-panel__header">
          <h4>Images</h4>
          <button className="flor-btn flor-btn--sm" onClick={() => fileInput.current?.click()}>
            Upload
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              for (const f of files) await addAssetFromFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {assets.length === 0 ? (
          <p className="flor-empty">No images yet. Upload photos or graphics to reuse across slides.</p>
        ) : (
          <div className="flor-lib-grid">
            {assets.map((a) => (
              <div key={a.id} className="flor-lib-card flor-lib-card--image">
                <img
                  src={a.src}
                  alt={a.name}
                  onClick={() => addElement(activeSlideId, makeImage(a.src))}
                  title="Add to slide"
                />
                <button className="flor-lib-card__remove" title="Remove" onClick={() => removeAsset(a.id)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
