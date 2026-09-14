import { Edge } from '@xyflow/react';
import { serializeGraph } from '~/lib/explore/pipelineSerialization';
import { logger } from '~/lib/logger';
import { ExploreNode } from '~/types/explore/nodes';

export const PIPELINE_DRAFT_KEY = 'pipelineDraft';

/**
 * The auto-saved snapshot of the pipeline the user is currently working on.
 * Kept separate from `savedPipelines` (the explicitly saved ones) so an autosave
 * can never overwrite a pipeline the user deliberately saved.
 */
export interface PipelineDraft {
    nodes: ExploreNode[];
    edges: Edge[];
    /** Set when the draft belongs to an explicitly saved pipeline. */
    pipelineId: string | null;
    pipelineName: string | null;
    savedAt: string;
    /** True while the draft is identical to its explicitly saved counterpart. */
    isSaved: boolean;
}

interface CurrentPipeline {
    id: string | null;
    name: string | null;
}

/**
 * `savedAt` and `isSaved` are the trailing fields of the serialized draft (see
 * the object literal in writePipelineDraft) and both change without the pipeline
 * itself changing, so they are cut off before comparing two drafts.
 */
const VOLATILE_TAIL = /,"savedAt":"[^"]*","isSaved":(?:true|false)}$/;

const isDraft = (value: unknown): value is PipelineDraft => {
    if (!value || typeof value !== 'object') return false;
    const draft = value as Partial<PipelineDraft>;
    return Array.isArray(draft.nodes) && Array.isArray(draft.edges) && typeof draft.savedAt === 'string';
};

export const readPipelineDraft = (): PipelineDraft | null => {
    const raw = localStorage.getItem(PIPELINE_DRAFT_KEY);
    if (!raw) return null;

    try {
        const parsed: unknown = JSON.parse(raw);
        if (!isDraft(parsed)) {
            localStorage.removeItem(PIPELINE_DRAFT_KEY);
            return null;
        }
        // Drafts written before isSaved existed are treated as unsaved work.
        return { ...parsed, isSaved: parsed.isSaved === true };
    } catch {
        logger.warn('Discarding corrupt pipeline draft');
        localStorage.removeItem(PIPELINE_DRAFT_KEY);
        return null;
    }
};

/** Fingerprint of the last written draft, used to skip redundant writes. */
let lastWrittenFingerprint: string | null = null;

/**
 * Writes the current flow to the draft slot. `isSaved` records whether the flow
 * still matches its explicitly saved counterpart, which is what tells the
 * restore prompts apart from an already-saved pipeline.
 */
export const writePipelineDraft = (
    nodes: ExploreNode[],
    edges: Edge[],
    currentPipeline: CurrentPipeline,
    { isSaved, savedAt }: { isSaved: boolean; savedAt?: string }
): void => {
    // An empty graph is never written: it is what the store looks like on a
    // fresh page load, and overwriting the draft with it would defeat the whole
    // purpose. Deliberate wipes go through clearPipelineDraft().
    if (nodes.length === 0) return;

    const { nodes: cleanNodes, edges: cleanEdges } = serializeGraph(nodes, edges);
    const draft: PipelineDraft = {
        nodes: cleanNodes,
        edges: cleanEdges,
        pipelineId: currentPipeline.id,
        pipelineName: currentPipeline.name,
        // Re-writing a draft that was only reloaded must not look like an edit.
        savedAt: savedAt ?? new Date().toISOString(),
        isSaved,
    };

    let serialized: string;
    try {
        serialized = JSON.stringify(draft);
    } catch {
        // Node data that cannot be serialized (circular references) — nothing to
        // autosave, and the explicit save would fail on it too.
        return;
    }

    // Skip writes that change nothing about the pipeline (e.g. selecting a
    // node), but never skip one that has to flip the isSaved flag.
    const fingerprint = serialized.replace(VOLATILE_TAIL, '');
    if (!isSaved && fingerprint === lastWrittenFingerprint) return;

    try {
        localStorage.setItem(PIPELINE_DRAFT_KEY, serialized);
        lastWrittenFingerprint = fingerprint;
    } catch (error) {
        logger.warn('Could not autosave the current pipeline, the previous autosave is kept', error);
    }
};

export const clearPipelineDraft = (): void => {
    localStorage.removeItem(PIPELINE_DRAFT_KEY);
    lastWrittenFingerprint = null;
};
