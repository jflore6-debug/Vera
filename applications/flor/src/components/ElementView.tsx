import { useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import type { SlideElement } from '../lib/types';
import { PT_TO_PX, SLIDE_H, SLIDE_W } from '../lib/types';
import { stripLeadingBulletGlyph } from '../lib/text';
import { useDeckStore } from '../store/deckStore';

interface Props {
  slideId: string;
  element: SlideElement;
  selected: boolean;
  scale: number;
}

function shapeStyle(fill: string, stroke: string | undefined, shape: string): React.CSSProperties {
  const base: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: fill,
    border: stroke ? `2px solid ${stroke}` : 'none',
    boxSizing: 'border-box',
  };
  if (shape === 'ellipse') base.borderRadius = '50%';
  if (shape === 'roundRect') base.borderRadius = '14px';
  if (shape === 'triangle') {
    return {
      width: 0,
      height: 0,
      borderLeft: '50% solid transparent',
      borderRight: '50% solid transparent',
      borderBottom: `100% solid ${fill}`,
      background: 'none',
      boxSizing: 'border-box',
    } as React.CSSProperties;
  }
  if (shape === 'line') {
    return { width: '100%', height: 4, background: fill, marginTop: '50%' };
  }
  return base;
}

export function ElementView({ slideId, element, selected, scale }: Props) {
  const updateElement = useDeckStore((s) => s.updateElement);
  const selectElement = useDeckStore((s) => s.selectElement);
  const deleteElement = useDeckStore((s) => s.deleteElement);
  const [editing, setEditing] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  const pxX = (element.x / 100) * SLIDE_W;
  const pxY = (element.y / 100) * SLIDE_H;
  const pxW = (element.w / 100) * SLIDE_W;
  const pxH = (element.h / 100) * SLIDE_H;

  return (
    <Rnd
      size={{ width: pxW, height: pxH }}
      position={{ x: pxX, y: pxY }}
      scale={scale}
      bounds="parent"
      disableDragging={editing}
      enableResizing={!editing}
      onDragStop={(_e, d) => {
        updateElement(slideId, element.id, {
          x: (d.x / SLIDE_W) * 100,
          y: (d.y / SLIDE_H) * 100,
        });
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        updateElement(slideId, element.id, {
          w: (ref.offsetWidth / SLIDE_W) * 100,
          h: (ref.offsetHeight / SLIDE_H) * 100,
          x: (pos.x / SLIDE_W) * 100,
          y: (pos.y / SLIDE_H) * 100,
        });
      }}
      onMouseDown={(e: MouseEvent) => {
        e.stopPropagation();
        selectElement(element.id);
      }}
      className={`flor-el ${selected ? 'flor-el--selected' : ''}`}
      style={{ zIndex: selected ? 5 : 1 }}
    >
      <div className="flor-el__rotate" style={{ transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined }}>
        {element.type === 'text' && (
          <div
            ref={textRef}
            className="flor-text"
            contentEditable={editing}
            suppressContentEditableWarning
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
              requestAnimationFrame(() => textRef.current?.focus());
            }}
            onBlur={() => {
              if (!editing) return;
              setEditing(false);
              const text = textRef.current?.innerText ?? element.content;
              updateElement(slideId, element.id, { content: text });
            }}
            style={{
              fontSize: element.fontSize * PT_TO_PX,
              color: element.color,
              textAlign: element.align,
              fontWeight: element.bold ? 700 : 400,
              fontStyle: element.italic ? 'italic' : 'normal',
              fontFamily: element.fontFamily,
              cursor: editing ? 'text' : 'grab',
              justifyContent:
                element.verticalAlign === 'middle' ? 'center' : element.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
            }}
          >
            {element.content.split('\n').map((line, i) => (
              <div key={i} className={element.bullet ? 'flor-bullet-line' : undefined}>
                {element.bullet ? stripLeadingBulletGlyph(line) : line}
              </div>
            ))}
          </div>
        )}

        {element.type === 'image' && (
          <img src={element.src} alt="" className="flor-image" draggable={false} />
        )}

        {element.type === 'shape' && <div style={shapeStyle(element.fill, element.stroke, element.shape)} />}
      </div>

      {selected && !editing && (
        <button
          className="flor-el__delete"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            deleteElement(slideId, element.id);
          }}
        >
          ×
        </button>
      )}
    </Rnd>
  );
}
