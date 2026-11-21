import { create } from 'zustand';

export type UploadState = {
  files: File[];
  addFiles: (newFiles: File[]) => void;
  removeFile: (index: number) => void;
  clear: () => void;
};

/**
 * Builds a store holding a list of files.
 *
 * Deliberately not persisted: zustand's `persist` middleware JSON-serialises
 * state, and a `File` reduces to `{}`. Rehydrating would hand the OCR pipeline
 * empty objects instead of readable blobs.
 *
 * Order screenshots and coupon screenshots get separate stores, so arriving at
 * the coupon step never disturbs the order the user already confirmed.
 */
export const createUploadStore = () =>
  create<UploadState>()((set) => ({
    files: [],
    addFiles: (newFiles) => set((state) => ({ files: [...state.files, ...newFiles] })),
    removeFile: (index) =>
      set((state) => ({ files: state.files.filter((_, i) => i !== index) })),
    clear: () => set({ files: [] }),
  }));

/** Screenshots of what was ordered. */
export const useUploadStore = createUploadStore();

/** Screenshots of discount coupons, which may span several apps and accounts. */
export const useCouponUploadStore = createUploadStore();