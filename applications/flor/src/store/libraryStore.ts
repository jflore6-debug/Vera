import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { LibraryAsset } from '../lib/types';
import { deleteAsset, listAssets, saveAsset } from '../lib/storage';

interface LibraryState {
  assets: LibraryAsset[];
  loaded: boolean;
  load: () => Promise<void>;
  addAssetFromFile: (file: File) => Promise<LibraryAsset>;
  removeAsset: (id: string) => Promise<void>;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  assets: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return;
    const assets = await listAssets();
    set({ assets, loaded: true });
  },

  addAssetFromFile: async (file) => {
    const src = await readFileAsDataUrl(file);
    const asset: LibraryAsset = { id: uuid(), name: file.name, src, createdAt: Date.now() };
    await saveAsset(asset);
    set((s) => ({ assets: [asset, ...s.assets] }));
    return asset;
  },

  removeAsset: async (id) => {
    await deleteAsset(id);
    set((s) => ({ assets: s.assets.filter((a) => a.id !== id) }));
  },
}));
