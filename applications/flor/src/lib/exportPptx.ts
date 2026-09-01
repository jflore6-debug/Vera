import PptxGenJS from 'pptxgenjs';
import type { Deck, ShapeElement, Slide, TextElement, ImageElement } from './types';
import { SLIDE_H_IN, SLIDE_W_IN } from './types';

function pct(value: number, total: number): number {
  return (value / 100) * total;
}

function hex(color: string): string {
  return color.replace('#', '').toUpperCase();
}

function addText(s: PptxGenJS.Slide, el: TextElement) {
  s.addText(el.content, {
    x: pct(el.x, SLIDE_W_IN),
    y: pct(el.y, SLIDE_H_IN),
    w: pct(el.w, SLIDE_W_IN),
    h: pct(el.h, SLIDE_H_IN),
    fontSize: el.fontSize,
    color: hex(el.color),
    align: el.align,
    bold: !!el.bold,
    italic: !!el.italic,
    fontFace: (el.fontFamily || 'Arial').split(',')[0].trim(),
    bullet: el.bullet ? { code: '2022' } : false,
    valign: 'top',
    rotate: el.rotation ?? 0,
    breakLine: true,
    autoFit: true,
  });
}

function addImage(s: PptxGenJS.Slide, el: ImageElement) {
  s.addImage({
    data: el.src,
    x: pct(el.x, SLIDE_W_IN),
    y: pct(el.y, SLIDE_H_IN),
    w: pct(el.w, SLIDE_W_IN),
    h: pct(el.h, SLIDE_H_IN),
    rotate: el.rotation ?? 0,
  });
}

function addShape(pres: PptxGenJS, s: PptxGenJS.Slide, el: ShapeElement) {
  s.addShape(pres.ShapeType[el.shape], {
    x: pct(el.x, SLIDE_W_IN),
    y: pct(el.y, SLIDE_H_IN),
    w: pct(el.w, SLIDE_W_IN),
    h: pct(el.h, SLIDE_H_IN),
    fill: { color: hex(el.fill) },
    line: el.stroke ? { color: hex(el.stroke), width: 1 } : { type: 'none' },
    rotate: el.rotation ?? 0,
  });
}

function buildSlide(pres: PptxGenJS, slide: Slide) {
  const s = pres.addSlide();
  s.background = { color: hex(slide.background === 'transparent' ? '#ffffff' : slide.background) };
  for (const el of slide.elements) {
    if (el.type === 'text') addText(s, el);
    else if (el.type === 'image') addImage(s, el);
    else if (el.type === 'shape') addShape(pres, s, el);
  }
}

export async function exportDeckToPptx(deck: Deck): Promise<void> {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'FLOR_WIDE', width: SLIDE_W_IN, height: SLIDE_H_IN });
  pres.layout = 'FLOR_WIDE';
  pres.title = deck.name;

  for (const slide of deck.slides) {
    buildSlide(pres, slide);
  }

  const fileName = `${deck.name.trim() || 'presentation'}.pptx`;
  await pres.writeFile({ fileName });
}
