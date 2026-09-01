import { useEffect, useState } from 'react';
import { useDeckStore } from '../store/deckStore';
import { deleteProject, listProjects, saveProject } from '../lib/storage';
import { makeDeck } from '../lib/factory';
import type { Deck } from '../lib/types';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function FilesPanel() {
  const deck = useDeckStore((s) => s.deck);
  const setDeck = useDeckStore((s) => s.setDeck);
  const persist = useDeckStore((s) => s.persist);
  const [projects, setProjects] = useState<Deck[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const refresh = async () => setProjects(await listProjects());

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = async () => {
    persist();
    setSavedAt(Date.now());
    await refresh();
  };

  const handleNew = async () => {
    const fresh = makeDeck('Untitled presentation');
    await saveProject(fresh);
    setDeck(fresh);
    await refresh();
  };

  const handleOpen = (p: Deck) => {
    setDeck(p);
  };

  const handleDuplicate = async (p: Deck) => {
    const copy: Deck = { ...p, id: crypto.randomUUID(), name: `${p.name} copy`, updatedAt: Date.now() };
    await saveProject(copy);
    await refresh();
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    await refresh();
  };

  return (
    <div className="flor-panel">
      <div className="flor-panel__header">
        <h3>My files</h3>
        <button className="flor-btn flor-btn--sm" onClick={handleNew}>
          + New
        </button>
      </div>

      <div className="flor-current-file">
        <div>
          <strong>{deck.name}</strong>
          <div className="flor-muted">{savedAt ? `Saved ${timeAgo(savedAt)}` : `Last edited ${timeAgo(deck.updatedAt)}`}</div>
        </div>
        <button className="flor-btn flor-btn--primary flor-btn--sm" onClick={handleSave}>
          Save
        </button>
      </div>

      <div className="flor-panel__header">
        <h4>Saved projects</h4>
      </div>
      {projects.length === 0 ? (
        <p className="flor-empty">Nothing saved yet. Click Save to keep this project in your library.</p>
      ) : (
        <div className="flor-file-list">
          {projects.map((p) => (
            <div key={p.id} className={`flor-file-list__item ${p.id === deck.id ? 'is-active' : ''}`}>
              <button className="flor-file-list__open" onClick={() => handleOpen(p)}>
                <span className="flor-file-list__name">{p.name}</span>
                <span className="flor-muted">{p.slides.length} slides · {timeAgo(p.updatedAt)}</span>
              </button>
              <div className="flor-file-list__actions">
                <button title="Duplicate" onClick={() => handleDuplicate(p)}>
                  ⧉
                </button>
                <button title="Delete" onClick={() => handleDelete(p.id)}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
