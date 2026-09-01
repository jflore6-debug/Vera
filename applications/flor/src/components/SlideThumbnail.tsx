import type { Slide } from '../lib/types';
import { SLIDE_H, SLIDE_W } from '../lib/types';

export function SlideThumbnail({ slide }: { slide: Slide }) {
  return (
    <div className="flor-thumb" style={{ background: slide.background }}>
      <div className="flor-thumb__scale">
        {slide.elements.map((el) => (
          <div
            key={el.id}
            className="flor-thumb__el"
            style={{
              left: `${el.x}%`,
              top: `${el.y}%`,
              width: `${el.w}%`,
              height: `${el.h}%`,
            }}
          >
            {el.type === 'text' && (
              <div
                style={{
                  fontSize: Math.max(4, el.fontSize / 8), // /6 thumbnail scale folded with the pt->px factor (0.75)
                  color: el.color,
                  textAlign: el.align,
                  fontWeight: el.bold ? 700 : 400,
                  fontStyle: el.italic ? 'italic' : 'normal',
                  lineHeight: 1.15,
                  overflow: 'hidden',
                }}
              >
                {el.content}
              </div>
            )}
            {el.type === 'image' && <img src={el.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            {el.type === 'shape' && (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  background: el.fill,
                  borderRadius: el.shape === 'ellipse' ? '50%' : el.shape === 'roundRect' ? 6 : 0,
                }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export const THUMB_ASPECT = SLIDE_W / SLIDE_H;
