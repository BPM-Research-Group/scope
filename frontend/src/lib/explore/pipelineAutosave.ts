import { useExploreFlowStore } from '~/stores/exploreStore';
import { writePipelineDraft } from '~/lib/explore/pipelineDraft';
import { isDetachedViewerTab } from '~/lib/explore/viewerTabs';

const AUTOSAVE_DEBOUNCE_MS = 1000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const persistCurrentPipeline = () => {
    const { nodes, edges, currentPipeline } = useExploreFlowStore.getState();
    // Anything the autosave picks up is by definition a change the user has not
    // explicitly saved; savePipeline() marks the draft saved again.
    writePipelineDraft(nodes, edges, currentPipeline, { isSaved: false });
};

/**
 * Mirrors the pipeline the user is working on into localStorage, so it survives
 * navigating away or reloading and can be restored on the explore canvas.
 * Call once at app startup.
 */
export const initPipelineAutosave = (): void => {
    // A detached viewer tab holds a copy of the pipeline it was seeded with.
    // Letting it write would overwrite the draft of the tab that owns the canvas.
    if (isDetachedViewerTab()) return;

    useExploreFlowStore.subscribe((state, prevState) => {
        const graphChanged = state.nodes !== prevState.nodes || state.edges !== prevState.edges;
        if (!graphChanged && state.currentPipeline === prevState.currentPipeline) return;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(persistCurrentPipeline, AUTOSAVE_DEBOUNCE_MS);
    });

    // A reload or tab close must not lose the last debounced changes.
    window.addEventListener('pagehide', flushPipelineDraft);
};

/**
 * Writes any pending changes right away. Used before opening a viewer in a new
 * tab, which seeds itself from the draft and would otherwise miss the last
 * second of edits.
 */
export const flushPipelineDraft = (): void => {
    if (isDetachedViewerTab()) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    persistCurrentPipeline();
};
