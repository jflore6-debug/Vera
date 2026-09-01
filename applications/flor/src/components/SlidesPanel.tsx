import { useState } from 'react';
import { useDeckStore } from '../store/deckStore';
import { SlideThumbnail } from './SlideThumbnail';
import { TEMPLATE_LAYOUTS } from '../lib/factory';

export function SlidesPanel() {
  const deck = useDeckStore((s) => s.deck);
  const activeSlideId = useDeckStore((s) => s.activeSlideId);
  const setActiveSlide = useDeckStore((s) => s.setActiveSlide);
  const addSlide = useDeckStore((s) => s.addSlide);
  const duplicateSlide = useDeckStore((s) => s.duplicateSlide);
  const deleteSlide = useDeckStore((s) => s.deleteSlide);
  const reorderSlide = useDeckStore((s) => s.reorderSlide);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flor-panel">
      <div className="flor-panel__header">
        <h3>Slides</h3>
        <button className="flor-btn flor-btn--sm" onClick={() => setPickerOpen((v) => !v)}>
          + Add
        </button>
      </div>

      {pickerOpen && (
        <div className="flor-template-picker">
          {TEMPLATE_LAYOUTS.map((t) => (
            <button
              key={t.id}
              className="flor-template-picker__item"
              onClick={() => {
                addSlide(t.build());
                setPickerOpen(false);
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      <div className="flor-slide-list">
        {deck.slides.map((slide, i) => (
          <div
            key={slide.id}
            className={`flor-slide-list__item ${slide.id === activeSlideId ? 'is-active' : ''}`}
            draggable
            onClick={() => setActiveSlide(slide.id)}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null && dragIndex !== i) reorderSlide(dragIndex, i);
              setDragIndex(null);
            }}
          >
            <span className="flor-slide-list__num">{i + 1}</span>
            <SlideThumbnail slide={slide} />
            <div className="flor-slide-list__actions">
              <button title="Duplicate" onClick={(e) => { e.stopPropagation(); duplicateSlide(slide.id); }}>
                ⧉
              </button>
              <button
                title="Delete"
                disabled={deck.slides.length <= 1}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSlide(slide.id);
                }}
              >
                🗑
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
