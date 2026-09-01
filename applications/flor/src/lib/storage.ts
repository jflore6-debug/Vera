import { createStore, get, set, del, keys } from 'idb-keyval';
import type { Deck, LibraryAsset } from './types';

const projectsStore = createStore('flor-projects', 'decks');
const assetsStore = createStore('flor-library', 'assets');
const metaStore = createStore('flor-meta', 'kv');

export async function saveProject(deck: Deck): Promise<void> {
  await set(deck.id, deck, projectsStore);
}

export async function loadProject(id: string): Promise<Deck | undefined> {
  return get(id, projectsStore);
}

export async function deleteProject(id: string): Promise<void> {
  await del(id, projectsStore);
}

export async function listProjects(): Promise<Deck[]> {
  const ids = await keys(projectsStore);
  const decks = await Promise.all(ids.map((id) => get(id as string, projectsStore) as Promise<Deck>));
  return decks.filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveAsset(asset: LibraryAsset): Promise<void> {
  await set(asset.id, asset, assetsStore);
}

export async function deleteAsset(id: string): Promise<void> {
  await del(id, assetsStore);
}

export async function listAssets(): Promise<LibraryAsset[]> {
  const ids = await keys(assetsStore);
  const assets = await Promise.all(ids.map((id) => get(id as string, assetsStore) as Promise<LibraryAsset>));
  return assets.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getLastOpenProjectId(): Promise<string | undefined> {
  return get('lastOpenProjectId', metaStore);
}

export async function setLastOpenProjectId(id: string): Promise<void> {
  await set('lastOpenProjectId', id, metaStore);
}
