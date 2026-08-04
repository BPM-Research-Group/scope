import { useExploreFlowStore } from '~/stores/exploreStore';
import { getDraftFingerprint, PipelineDraft, writePipelineDraft } from '~/lib/explore/pipelineDraft';
import { serializeGraph } from '~/lib/explore/pipelineSerialization';

const AUTOSAVE_DEBOUNCE_MS = 1000;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const persistCurrentPipeline = () => {
    const { nodes, edges, currentPipeline } = useExploreFlowStore.getState();

    // An empty graph is never autosaved: it is what the store looks like on a
    // fresh page load, and overwriting the draft with it would defeat the whole
    // purpose. Deliberate wipes go through clearFlow(), which clears the draft.
    if (nodes.length === 0) return;

    const draft: PipelineDraft = {
        ...serializeGraph(nodes, edges),
        pipelineId: currentPipeline.id,
        pipelineName: currentPipeline.name,
        savedAt: new Date().toISOString(),
    };

    let serialized: string;
    try {
        serialized = JSON.stringify(draft);
    } catch {
        // Node data that cannot be serialized (circular references) — nothing to
        // autosave, and the explicit save would fail on it too.
        return;
    }

    // The timestamp always differs, so compare everything but it to skip writes
    // for changes that do not alter the pipeline (e.g. selecting a node).
    const fingerprint = serialized.replace(/,"savedAt":"[^"]*"}$/, '');
    if (fingerprint === getDraftFingerprint()) return;

    writePipelineDraft(serialized, fingerprint);
};

/**
 * Mirrors the pipeline the user is working on into localStorage, so it can be
 * restored from the pipeline overview after navigating away or reloading.
 * Call once at app startup.
 */
export const initPipelineAutosave = (): void => {
    useExploreFlowStore.subscribe((state, prevState) => {
        const graphChanged = state.nodes !== prevState.nodes || state.edges !== prevState.edges;
        if (!graphChanged && state.currentPipeline === prevState.currentPipeline) return;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(persistCurrentPipeline, AUTOSAVE_DEBOUNCE_MS);
    });

    // A reload or tab close must not lose the last debounced changes.
    window.addEventListener('pagehide', () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        persistCurrentPipeline();
    });
};
