import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useDeckStore } from './store/deckStore';
import { TopBar } from './components/TopBar';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { SlidesPanel } from './components/SlidesPanel';
import { LibraryPanel } from './components/LibraryPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { FilesPanel } from './components/FilesPanel';
import { PropertiesPanel } from './components/PropertiesPanel';
import { getLastOpenProjectId, loadProject } from './lib/storage';

type Tab = 'slides' | 'library' | 'history' | 'files';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'slides', label: 'Slides', icon: '▭' },
  { id: 'library', label: 'Library', icon: '✦' },
  { id: 'history', label: 'History', icon: '↺' },
  { id: 'files', label: 'Files', icon: '⌂' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('slides');
  const deck = useDeckStore((s) => s.deck);
  const setDeck = useDeckStore((s) => s.setDeck);
  const persist = useDeckStore((s) => s.persist);
  const selectedElementId = useDeckStore((s) => s.selectedElementId);
  const deleteElement = useDeckStore((s) => s.deleteElement);
  const activeSlideId = useDeckStore((s) => s.activeSlideId);
  const { undo, redo } = useStore(useDeckStore.temporal);

  useEffect(() => {
    (async () => {
      const lastId = await getLastOpenProjectId();
      if (lastId) {
        const project = await loadProject(lastId);
        if (project) setDeck(project);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave shortly after any change.
  useEffect(() => {
    const t = setTimeout(() => persist(), 800);
    return () => clearTimeout(t);
  }, [deck, persist]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if (typing) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          persist();
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        persist();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElementId) {
        e.preventDefault();
        deleteElement(activeSlideId, selectedElementId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, persist, selectedElementId, activeSlideId, deleteElement]);

  return (
    <div className="flor-app">
      <TopBar />
      <div className="flor-body">
        <nav className="flor-rail">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`flor-rail__btn ${tab === t.id ? 'is-active' : ''}`}
              onClick={() => setTab(t.id)}
              title={t.label}
            >
              <span className="flor-rail__icon">{t.icon}</span>
              <span className="flor-rail__label">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="flor-side">
          {tab === 'slides' && <SlidesPanel />}
          {tab === 'library' && <LibraryPanel />}
          {tab === 'history' && <HistoryPanel />}
          {tab === 'files' && <FilesPanel />}
        </div>
        <main className="flor-main">
          <Toolbar />
          <Canvas />
        </main>
        <PropertiesPanel />
      </div>
    </div>
  );
}
