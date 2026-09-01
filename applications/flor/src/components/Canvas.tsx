import { useEffect, useRef, useState } from 'react';
import { SLIDE_H, SLIDE_W } from '../lib/types';
import { useDeckStore } from '../store/deckStore';
import { ElementView } from './ElementView';

export function Canvas() {
  const deck = useDeckStore((s) => s.deck);
  const activeSlideId = useDeckStore((s) => s.activeSlideId);
  const selectedElementId = useDeckStore((s) => s.selectedElementId);
  const selectElement = useDeckStore((s) => s.selectElement);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const slide = deck.slides.find((s) => s.id === activeSlideId) ?? deck.slides[0];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const compute = () => {
      const pad = 48;
      const availW = el.clientWidth - pad;
      const availH = el.clientHeight - pad;
      setScale(Math.max(0.2, Math.min(availW / SLIDE_W, availH / SLIDE_H)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!slide) return null;

  return (
    <div className="flor-canvas-wrap" ref={containerRef} onMouseDown={() => selectElement(null)}>
      <div
        className="flor-slide"
        style={{
          width: SLIDE_W,
          height: SLIDE_H,
          transform: `scale(${scale})`,
          background: slide.background,
        }}
      >
        {slide.elements.map((el) => (
          <ElementView
            key={el.id}
            slideId={slide.id}
            element={el}
            selected={el.id === selectedElementId}
            scale={scale}
          />
        ))}
      </div>
    </div>
  );
}
