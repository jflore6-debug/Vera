import { create } from 'zustand';
import { temporal } from 'zundo';
import { v4 as uuid } from 'uuid';
import { produce } from 'immer';
import type { Deck, Slide, SlideElement } from '../lib/types';
import { makeDeck, makeSlide } from '../lib/factory';
import { saveProject, setLastOpenProjectId } from '../lib/storage';

interface DeckState {
  deck: Deck;
  activeSlideId: string;
  selectedElementId: string | null;

  setDeck: (deck: Deck) => void;
  renameDeck: (name: string) => void;

  setActiveSlide: (id: string) => void;
  addSlide: (slide?: Slide) => void;
  duplicateSlide: (id: string) => void;
  deleteSlide: (id: string) => void;
  reorderSlide: (fromIndex: number, toIndex: number) => void;
  updateSlideBackground: (id: string, background: string) => void;

  addElement: (slideId: string, element: SlideElement) => void;
  updateElement: (slideId: string, elementId: string, patch: Partial<SlideElement>) => void;
  deleteElement: (slideId: string, elementId: string) => void;
  selectElement: (id: string | null) => void;

  touch: () => void;
  persist: () => void;
}

export const useDeckStore = create<DeckState>()(
  temporal(
    (set, get) => ({
      deck: makeDeck(),
      activeSlideId: '',
      selectedElementId: null,

      setDeck: (deck) =>
        set(() => ({
          deck,
          activeSlideId: deck.slides[0]?.id ?? '',
          selectedElementId: null,
        })),

      renameDeck: (name) =>
        set(
          produce((s: DeckState) => {
            s.deck.name = name;
            s.deck.updatedAt = Date.now();
          })
        ),

      setActiveSlide: (id) => set({ activeSlideId: id, selectedElementId: null }),

      addSlide: (slide) =>
        set(
          produce((s: DeckState) => {
            const newSlide = slide ?? makeSlide();
            s.deck.slides.push(newSlide);
            s.deck.updatedAt = Date.now();
            s.activeSlideId = newSlide.id;
            s.selectedElementId = null;
          })
        ),

      duplicateSlide: (id) =>
        set(
          produce((s: DeckState) => {
            const idx = s.deck.slides.findIndex((sl) => sl.id === id);
            if (idx === -1) return;
            const original = s.deck.slides[idx];
            const copy: Slide = {
              ...original,
              id: uuid(),
              elements: original.elements.map((el) => ({ ...el, id: uuid() })),
            };
            s.deck.slides.splice(idx + 1, 0, copy);
            s.deck.updatedAt = Date.now();
            s.activeSlideId = copy.id;
          })
        ),

      deleteSlide: (id) =>
        set(
          produce((s: DeckState) => {
            if (s.deck.slides.length <= 1) return;
            const idx = s.deck.slides.findIndex((sl) => sl.id === id);
            if (idx === -1) return;
            s.deck.slides.splice(idx, 1);
            s.deck.updatedAt = Date.now();
            if (s.activeSlideId === id) {
              s.activeSlideId = s.deck.slides[Math.max(0, idx - 1)].id;
            }
          })
        ),

      reorderSlide: (fromIndex, toIndex) =>
        set(
          produce((s: DeckState) => {
            const [moved] = s.deck.slides.splice(fromIndex, 1);
            s.deck.slides.splice(toIndex, 0, moved);
            s.deck.updatedAt = Date.now();
          })
        ),

      updateSlideBackground: (id, background) =>
        set(
          produce((s: DeckState) => {
            const slide = s.deck.slides.find((sl) => sl.id === id);
            if (slide) slide.background = background;
            s.deck.updatedAt = Date.now();
          })
        ),

      addElement: (slideId, element) =>
        set(
          produce((s: DeckState) => {
            const slide = s.deck.slides.find((sl) => sl.id === slideId);
            if (!slide) return;
            slide.elements.push(element);
            s.deck.updatedAt = Date.now();
            s.selectedElementId = element.id;
          })
        ),

      updateElement: (slideId, elementId, patch) =>
        set(
          produce((s: DeckState) => {
            const slide = s.deck.slides.find((sl) => sl.id === slideId);
            if (!slide) return;
            const el = slide.elements.find((e) => e.id === elementId);
            if (!el) return;
            Object.assign(el, patch);
            s.deck.updatedAt = Date.now();
          })
        ),

      deleteElement: (slideId, elementId) =>
        set(
          produce((s: DeckState) => {
            const slide = s.deck.slides.find((sl) => sl.id === slideId);
            if (!slide) return;
            slide.elements = slide.elements.filter((e) => e.id !== elementId);
            s.deck.updatedAt = Date.now();
            if (s.selectedElementId === elementId) s.selectedElementId = null;
          })
        ),

      selectElement: (id) => set({ selectedElementId: id }),

      touch: () =>
        set(
          produce((s: DeckState) => {
            s.deck.updatedAt = Date.now();
          })
        ),

      persist: () => {
        const { deck } = get();
        void saveProject(deck);
        void setLastOpenProjectId(deck.id);
      },
    }),
    {
      // Only track the deck contents in undo/redo history, not UI selection state.
      partialize: (s) => ({ deck: s.deck }),
      limit: 100,
      equality: (a, b) => JSON.stringify(a.deck) === JSON.stringify(b.deck),
    }
  )
);

useDeckStore.setState({ activeSlideId: useDeckStore.getState().deck.slides[0].id });
