import { useDeckStore } from '../store/deckStore';

const TEXT_COLORS = ['#1f2430', '#ffffff', '#e85d75', '#4a7c59', '#2563eb', '#9333ea', '#f59e0b'];
const FILL_COLORS = ['#e85d75', '#f4a4b7', '#4a7c59', '#a8d5ba', '#2563eb', '#9333ea', '#f59e0b', '#1f2430', '#eef0f4'];
const BG_COLORS = ['#ffffff', '#fdf2f4', '#f6f7fb', '#1f2430', '#eef0f4', '#fff7ed'];

export function PropertiesPanel() {
  const deck = useDeckStore((s) => s.deck);
  const activeSlideId = useDeckStore((s) => s.activeSlideId);
  const selectedElementId = useDeckStore((s) => s.selectedElementId);
  const updateElement = useDeckStore((s) => s.updateElement);
  const updateSlideBackground = useDeckStore((s) => s.updateSlideBackground);

  const slide = deck.slides.find((s) => s.id === activeSlideId);
  const element = slide?.elements.find((e) => e.id === selectedElementId);

  if (!slide) return null;

  if (!element) {
    return (
      <div className="flor-panel flor-panel--right">
        <div className="flor-panel__header">
          <h3>Slide</h3>
        </div>
        <label className="flor-field-label">Background</label>
        <div className="flor-swatches">
          {BG_COLORS.map((c) => (
            <button
              key={c}
              className={`flor-swatch ${slide.background === c ? 'is-selected' : ''}`}
              style={{ background: c }}
              onClick={() => updateSlideBackground(slide.id, c)}
            />
          ))}
          <input
            type="color"
            value={slide.background}
            onChange={(e) => updateSlideBackground(slide.id, e.target.value)}
            className="flor-swatch flor-swatch--custom"
          />
        </div>
        <p className="flor-empty">Select an element on the slide to edit its style.</p>
      </div>
    );
  }

  return (
    <div className="flor-panel flor-panel--right">
      <div className="flor-panel__header">
        <h3>{element.type === 'text' ? 'Text' : element.type === 'image' ? 'Image' : 'Shape'}</h3>
      </div>

      {element.type === 'text' && (
        <>
          <label className="flor-field-label">Font size</label>
          <input
            type="range"
            min={10}
            max={80}
            value={element.fontSize}
            onChange={(e) => updateElement(slide.id, element.id, { fontSize: Number(e.target.value) })}
          />
          <div className="flor-btn-row">
            <button
              className={`flor-toggle ${element.bold ? 'is-active' : ''}`}
              onClick={() => updateElement(slide.id, element.id, { bold: !element.bold })}
            >
              B
            </button>
            <button
              className={`flor-toggle ${element.italic ? 'is-active' : ''}`}
              onClick={() => updateElement(slide.id, element.id, { italic: !element.italic })}
            >
              I
            </button>
            <button
              className={`flor-toggle ${element.bullet ? 'is-active' : ''}`}
              onClick={() => updateElement(slide.id, element.id, { bullet: !element.bullet })}
            >
              • List
            </button>
          </div>
          <div className="flor-btn-row">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                className={`flor-toggle ${element.align === a ? 'is-active' : ''}`}
                onClick={() => updateElement(slide.id, element.id, { align: a })}
              >
                {a}
              </button>
            ))}
          </div>
          <label className="flor-field-label">Color</label>
          <div className="flor-swatches">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                className={`flor-swatch ${element.color === c ? 'is-selected' : ''}`}
                style={{ background: c }}
                onClick={() => updateElement(slide.id, element.id, { color: c })}
              />
            ))}
            <input
              type="color"
              value={element.color}
              onChange={(e) => updateElement(slide.id, element.id, { color: e.target.value })}
              className="flor-swatch flor-swatch--custom"
            />
          </div>
        </>
      )}

      {element.type === 'shape' && (
        <>
          <label className="flor-field-label">Shape</label>
          <select
            value={element.shape}
            onChange={(e) => updateElement(slide.id, element.id, { shape: e.target.value as typeof element.shape })}
          >
            <option value="rect">Rectangle</option>
            <option value="roundRect">Rounded rectangle</option>
            <option value="ellipse">Ellipse</option>
            <option value="triangle">Triangle</option>
            <option value="line">Line</option>
          </select>
          <label className="flor-field-label">Fill</label>
          <div className="flor-swatches">
            {FILL_COLORS.map((c) => (
              <button
                key={c}
                className={`flor-swatch ${element.fill === c ? 'is-selected' : ''}`}
                style={{ background: c }}
                onClick={() => updateElement(slide.id, element.id, { fill: c })}
              />
            ))}
            <input
              type="color"
              value={element.fill}
              onChange={(e) => updateElement(slide.id, element.id, { fill: e.target.value })}
              className="flor-swatch flor-swatch--custom"
            />
          </div>
        </>
      )}

      {element.type === 'image' && <p className="flor-empty">Drag to move, drag a corner to resize.</p>}
    </div>
  );
}
