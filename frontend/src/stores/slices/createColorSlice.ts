import { StateCreator } from 'zustand';
import { getDeterministicColor, getSequentialColor } from '~/lib/colors';
import { ExploreFlowStore } from '~/stores/exploreStore';
import { ColorSlice } from './colorSlice.types';

export const createColorSlice: StateCreator<ExploreFlowStore, [], [], ColorSlice> = (set, get) => ({
    colorMaps: {},
    fileColorIndexes: {},
    initializeDataState: (fileId: string, objectTypes: string[]) => {
        const state = get();
        // Get existing map and index for this file
        const currentMap = { ...(state.colorMaps[fileId] || {}) };
        let currentIndex = state.fileColorIndexes[fileId] || 0;
        let hasChanges = false;
        // Track already used colors to prevent collisions
        const usedColors = new Set(Object.values(currentMap));
        //Deduplicate inputs
        const uniqueTypes = Array.from(new Set(objectTypes));
        uniqueTypes.forEach((type) => {
            if (!currentMap[type]) {
                let color = '';
                let attempts = 0;
                // 4. Find next available unique color
                do {
                    color = getSequentialColor(currentIndex);
                    currentIndex++;
                    attempts++;
                } while (usedColors.has(color) && attempts < 100);
                currentMap[type] = color;
                usedColors.add(color);
                hasChanges = true;
            }
        });
        if (hasChanges) {
            set((state) => ({
                colorMaps: {
                    ...state.colorMaps,
                    [fileId]: currentMap,
                },
                fileColorIndexes: {
                    ...state.fileColorIndexes,
                    [fileId]: currentIndex,
                },
            }));
        }
    },
    getColorForObject: (fileId: string, objectType: string): string => {
        const state = get();
        const colorMap = state.colorMaps[fileId];
        if (colorMap && colorMap[objectType]) {
            return colorMap[objectType];
        }
        // Fallback for uninitialized types
        return getDeterministicColor(objectType);
    },
});
