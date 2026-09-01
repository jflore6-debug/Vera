import { v4 as uuid } from 'uuid';
import type { Deck, ImageElement, Slide, ShapeElement, ShapeKind, TextElement } from './types';

export function makeText(partial: Partial<TextElement> = {}): TextElement {
  return {
    id: uuid(),
    type: 'text',
    x: 8,
    y: 8,
    w: 40,
    h: 15,
    content: 'Double-click to edit',
    fontSize: 32,
    color: '#1f2430',
    align: 'left',
    bold: false,
    italic: false,
    fontFamily: 'Inter, Arial, sans-serif',
    bullet: false,
    ...partial,
  };
}

export function makeImage(src: string, partial: Partial<ImageElement> = {}): ImageElement {
  return {
    id: uuid(),
    type: 'image',
    x: 15,
    y: 20,
    w: 40,
    h: 40,
    src,
    ...partial,
  };
}

export function makeShape(shape: ShapeKind, partial: Partial<ShapeElement> = {}): ShapeElement {
  return {
    id: uuid(),
    type: 'shape',
    shape,
    x: 20,
    y: 20,
    w: 30,
    h: 20,
    fill: '#e85d75',
    stroke: undefined,
    ...partial,
  };
}

export function makeSlide(partial: Partial<Slide> = {}): Slide {
  return {
    id: uuid(),
    background: '#ffffff',
    elements: [],
    ...partial,
  };
}

export function makeDeck(name = 'Untitled presentation'): Deck {
  const now = Date.now();
  return {
    id: uuid(),
    name,
    createdAt: now,
    updatedAt: now,
    slides: [
      makeSlide({
        background: '#ffffff',
        elements: [
          makeText({
            x: 8,
            y: 32,
            w: 84,
            h: 20,
            content: name,
            fontSize: 58,
            align: 'center',
            bold: true,
          }),
          makeText({
            x: 8,
            y: 54,
            w: 84,
            h: 10,
            content: 'Click to add a subtitle',
            fontSize: 27,
            align: 'center',
            color: '#6b7280',
          }),
        ],
      }),
    ],
  };
}

// Built-in library layouts a user can drop into their deck.
export const TEMPLATE_LAYOUTS: { id: string; name: string; build: () => Slide }[] = [
  {
    id: 'title',
    name: 'Title slide',
    build: () =>
      makeSlide({
        background: '#ffffff',
        elements: [
          makeText({ x: 8, y: 32, w: 84, h: 20, content: 'Presentation title', fontSize: 58, align: 'center', bold: true }),
          makeText({ x: 8, y: 54, w: 84, h: 10, content: 'Subtitle goes here', fontSize: 27, align: 'center', color: '#6b7280' }),
        ],
      }),
  },
  {
    id: 'title-bullets',
    name: 'Title + bullets',
    build: () =>
      makeSlide({
        background: '#ffffff',
        elements: [
          makeText({ x: 6, y: 6, w: 88, h: 12, content: 'Slide title', fontSize: 43, bold: true }),
          makeText({
            x: 6,
            y: 22,
            w: 88,
            h: 65,
            content: 'First point\nSecond point\nThird point',
            fontSize: 27,
            bullet: true,
          }),
        ],
      }),
  },
  {
    id: 'two-column',
    name: 'Two column',
    build: () =>
      makeSlide({
        background: '#ffffff',
        elements: [
          makeText({ x: 6, y: 6, w: 88, h: 12, content: 'Slide title', fontSize: 43, bold: true }),
          makeText({ x: 6, y: 22, w: 42, h: 65, content: 'Left column text', fontSize: 24, bullet: true }),
          makeText({ x: 52, y: 22, w: 42, h: 65, content: 'Right column text', fontSize: 24, bullet: true }),
        ],
      }),
  },
  {
    id: 'image-right',
    name: 'Text + image',
    build: () =>
      makeSlide({
        background: '#ffffff',
        elements: [
          makeText({ x: 6, y: 6, w: 44, h: 12, content: 'Slide title', fontSize: 37, bold: true }),
          makeText({ x: 6, y: 22, w: 44, h: 65, content: 'Supporting text goes here.', fontSize: 24 }),
          makeShape('rect', { x: 54, y: 12, w: 40, h: 76, fill: '#eef0f4' }),
        ],
      }),
  },
  {
    id: 'quote',
    name: 'Quote',
    build: () =>
      makeSlide({
        background: '#1f2430',
        elements: [
          makeText({
            x: 10,
            y: 30,
            w: 80,
            h: 40,
            content: '"Say something memorable."',
            fontSize: 45,
            align: 'center',
            italic: true,
            color: '#ffffff',
          }),
          makeText({ x: 10, y: 70, w: 80, h: 10, content: '— Attribution', fontSize: 24, align: 'center', color: '#9aa0ac' }),
        ],
      }),
  },
  {
    id: 'blank',
    name: 'Blank',
    build: () => makeSlide({ background: '#ffffff', elements: [] }),
  },
];
