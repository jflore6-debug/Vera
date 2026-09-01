export type ElementType = 'text' | 'image' | 'shape';

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number; // percent 0-100, relative to slide (13.33x7.5in canvas)
  y: number;
  w: number;
  h: number;
  rotation?: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  bold?: boolean;
  italic?: boolean;
  fontFamily?: string;
  bullet?: boolean;
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string; // data URL
}

export type ShapeKind = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'line';

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeKind;
  fill: string;
  stroke?: string;
}

export type SlideElement = TextElement | ImageElement | ShapeElement;

export interface Slide {
  id: string;
  background: string;
  elements: SlideElement[];
}

export interface Deck {
  id: string;
  name: string;
  slides: Slide[];
  createdAt: number;
  updatedAt: number;
}

export interface LibraryAsset {
  id: string;
  name: string;
  src: string; // data URL
  createdAt: number;
}

export const SLIDE_W = 720; // px, 13.33in * 54
export const SLIDE_H = 405; // px, 7.5in * 54
export const SLIDE_W_IN = 13.333;
export const SLIDE_H_IN = 7.5;
