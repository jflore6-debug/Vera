import { jsPDF } from 'jspdf';
import type { Deck, ImageElement, ShapeElement, Slide, TextElement } from './types';
import { SLIDE_H_IN, SLIDE_W_IN } from './types';
import { stripLeadingBulletGlyph } from './text';

const PAGE_W = SLIDE_W_IN * 72;
const PAGE_H = SLIDE_H_IN * 72;

function pct(value: number, totalPt: number): number {
  return (value / 100) * totalPt;
}

function rgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [parseInt(clean.slice(0, 2), 16) || 0, parseInt(clean.slice(2, 4), 16) || 0, parseInt(clean.slice(4, 6), 16) || 0];
}

function resolveFontFamily(fontFamily: string | undefined): 'helvetica' | 'times' | 'courier' {
  const f = (fontFamily || '').toLowerCase();
  if (/mono|courier|consolas/.test(f)) return 'courier';
  if (/serif|times|georgia|cambria|garamond|palatino|book/.test(f)) return 'times';
  return 'helvetica'; // covers Inter, Arial, Calibri, Segoe, and unknown fonts
}

function fontStyle(bold?: boolean, italic?: boolean): string {
  if (bold && italic) return 'bolditalic';
  if (bold) return 'bold';
  if (italic) return 'italic';
  return 'normal';
}

function drawText(doc: jsPDF, el: TextElement) {
  const x = pct(el.x, PAGE_W);
  const y = pct(el.y, PAGE_H);
  const w = pct(el.w, PAGE_W);
  const h = pct(el.h, PAGE_H);

  doc.setFont(resolveFontFamily(el.fontFamily), fontStyle(el.bold, el.italic));
  doc.setFontSize(el.fontSize);
  doc.setTextColor(...rgb(el.color));

  const lineHeight = el.fontSize * 1.22;
  const bulletIndent = el.bullet ? el.fontSize * 1.15 : 0;
  const padding = 3; // pt, approximates the editor's 4px text padding
  const availWidth = Math.max(10, w - bulletIndent - padding * 2);

  // Wrap each paragraph to the box width (like the browser wraps text in
  // the editor) so multi-line paragraphs stack with accurate positions
  // instead of overlapping.
  const paragraphs = el.content.split('\n').map((line) => (el.bullet ? stripLeadingBulletGlyph(line) : line));
  const wrapped: string[][] = paragraphs.map((p) => doc.splitTextToSize(p.length ? p : ' ', availWidth) as string[]);
  const totalLines = wrapped.reduce((n, ls) => n + ls.length, 0);
  const totalTextHeight = totalLines * lineHeight;

  let cursorY: number;
  if (el.verticalAlign === 'middle') cursorY = y + Math.max(0, (h - totalTextHeight) / 2);
  else if (el.verticalAlign === 'bottom') cursorY = y + h - totalTextHeight;
  else cursorY = y;
  cursorY += lineHeight * 0.82; // baseline offset within the first line

  const textX = el.align === 'center' ? x + w / 2 : el.align === 'right' ? x + w - padding : x + padding;
  const angle = el.rotation || undefined;

  for (const paragraphLines of wrapped) {
    paragraphLines.forEach((renderLine, subIndex) => {
      if (el.bullet) {
        if (subIndex === 0) doc.text('•', x + padding, cursorY, { align: 'left', angle });
        doc.text(renderLine, x + padding + bulletIndent, cursorY, { align: 'left', angle });
      } else {
        doc.text(renderLine, textX, cursorY, { align: el.align, angle });
      }
      cursorY += lineHeight;
    });
  }
}

function drawShape(doc: jsPDF, el: ShapeElement) {
  const x = pct(el.x, PAGE_W);
  const y = pct(el.y, PAGE_H);
  const w = pct(el.w, PAGE_W);
  const h = pct(el.h, PAGE_H);

  // A "line" shape has no fillable area — Flor treats its `fill` field as
  // the line's own color (see ElementView's shapeStyle), matching how it's
  // imported/rendered elsewhere in the app.
  if (el.shape === 'line') {
    doc.setDrawColor(...rgb(el.fill));
    doc.setLineWidth(1.5);
    const midY = y + h / 2;
    doc.line(x, midY, x + w, midY);
    return;
  }

  const hasFill = !!el.fill && el.fill !== 'transparent';
  const hasStroke = !!el.stroke;
  if (hasFill) doc.setFillColor(...rgb(el.fill));
  if (hasStroke) {
    doc.setDrawColor(...rgb(el.stroke!));
    doc.setLineWidth(1);
  }
  const style = hasFill && hasStroke ? 'FD' : hasFill ? 'F' : hasStroke ? 'S' : null;
  if (!style) return; // fully transparent, nothing to draw

  // Rotated shapes aren't supported yet (jsPDF has no direct rotation
  // param for vector shapes, unlike text/images) — draw unrotated rather
  // than skip the shape entirely.
  switch (el.shape) {
    case 'rect':
      doc.rect(x, y, w, h, style);
      break;
    case 'roundRect': {
      const r = Math.min(w, h) * 0.08;
      doc.roundedRect(x, y, w, h, r, r, style);
      break;
    }
    case 'ellipse':
      doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, style);
      break;
    case 'triangle':
      doc.triangle(x + w / 2, y, x, y + h, x + w, y + h, style);
      break;
  }
}

const SUPPORTED_IMAGE_FORMATS: Record<string, string> = {
  png: 'PNG',
  jpg: 'JPEG',
  jpeg: 'JPEG',
  webp: 'WEBP',
  bmp: 'BMP',
  gif: 'GIF',
};

function drawImage(doc: jsPDF, el: ImageElement) {
  const mime = el.src.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/)?.[1]?.toLowerCase();
  const format = mime ? SUPPORTED_IMAGE_FORMATS[mime] : undefined;
  if (!format) return; // e.g. SVG, which jsPDF's addImage can't rasterize — skip rather than crash the export

  const x = pct(el.x, PAGE_W);
  const y = pct(el.y, PAGE_H);
  const w = pct(el.w, PAGE_W);
  const h = pct(el.h, PAGE_H);
  doc.addImage(el.src, format, x, y, w, h, undefined, 'FAST', el.rotation || 0);
}

function drawSlide(doc: jsPDF, slide: Slide) {
  const bg = slide.background === 'transparent' ? '#ffffff' : slide.background;
  doc.setFillColor(...rgb(bg));
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  for (const el of slide.elements) {
    if (el.type === 'shape') drawShape(doc, el);
    else if (el.type === 'image') drawImage(doc, el);
    else if (el.type === 'text') drawText(doc, el);
  }
}

export async function exportDeckToPdf(deck: Deck): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: [PAGE_W, PAGE_H] });
  doc.setProperties({ title: deck.name });

  deck.slides.forEach((slide, i) => {
    if (i > 0) doc.addPage([PAGE_W, PAGE_H]);
    drawSlide(doc, slide);
  });

  const fileName = `${deck.name.trim() || 'presentation'}.pdf`;
  doc.save(fileName);
}
