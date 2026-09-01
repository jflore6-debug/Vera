import { useRef, useState } from 'react';
import { useStore } from 'zustand';
import { useDeckStore } from '../store/deckStore';
import { useLibraryStore } from '../store/libraryStore';
import { makeText, makeShape } from '../lib/factory';
import type { ShapeKind } from '../lib/types';

const SHAPES: { kind: ShapeKind; label: string }[] = [
  { kind: 'rect', label: '▭ Rectangle' },
  { kind: 'roundRect', label: '▢ Rounded' },
  { kind: 'ellipse', label: '⬭ Ellipse' },
  { kind: 'triangle', label: '△ Triangle' },
  { kind: 'line', label: '— Line' },
];

export function Toolbar() {
  const activeSlideId = useDeckStore((s) => s.activeSlideId);
  const addElement = useDeckStore((s) => s.addElement);
  const { undo, redo, pastStates, futureStates } = useStore(useDeckStore.temporal);
  const addAssetFromFile = useLibraryStore((s) => s.addAssetFromFile);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flor-toolbar">
      <div className="flor-toolbar__group">
        <button className="flor-btn flor-btn--sm" disabled={pastStates.length === 0} onClick={() => undo()} title="Undo">
          ↶
        </button>
        <button className="flor-btn flor-btn--sm" disabled={futureStates.length === 0} onClick={() => redo()} title="Redo">
          ↷
        </button>
      </div>
      <div className="flor-toolbar__group">
        <button
          className="flor-btn flor-btn--sm"
          onClick={() => addElement(activeSlideId, makeText())}
        >
          + Text
        </button>
        <div className="flor-toolbar__dropdown">
          <button className="flor-btn flor-btn--sm" onClick={() => setShapeMenuOpen((v) => !v)}>
            + Shape ▾
          </button>
          {shapeMenuOpen && (
            <div className="flor-toolbar__menu">
              {SHAPES.map((s) => (
                <button
                  key={s.kind}
                  onClick={() => {
                    addElement(activeSlideId, makeShape(s.kind));
                    setShapeMenuOpen(false);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="flor-btn flor-btn--sm" onClick={() => imageInput.current?.click()}>
          + Image
        </button>
        <input
          ref={imageInput}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              const asset = await addAssetFromFile(f);
              addElement(activeSlideId, {
                id: crypto.randomUUID(),
                type: 'image',
                x: 15,
                y: 20,
                w: 40,
                h: 40,
                src: asset.src,
              });
            }
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
