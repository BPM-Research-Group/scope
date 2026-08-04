import { Edge } from '@xyflow/react';
import { ExploreNode } from '~/types/explore/nodes';
import { logger } from '~/lib/logger';

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
}

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
        return parsed;
    } catch {
        logger.warn('Discarding corrupt pipeline draft');
        localStorage.removeItem(PIPELINE_DRAFT_KEY);
        return null;
    }
};

/**
 * Fingerprint of the last successfully written draft (everything but its
 * timestamp), used by the autosave to skip redundant writes.
 */
let lastWrittenFingerprint: string | null = null;

export const getDraftFingerprint = (): string | null => lastWrittenFingerprint;

/** Returns false when the draft could not be stored (e.g. localStorage quota exceeded). */
export const writePipelineDraft = (serializedDraft: string, fingerprint: string): boolean => {
    try {
        localStorage.setItem(PIPELINE_DRAFT_KEY, serializedDraft);
        lastWrittenFingerprint = fingerprint;
        return true;
    } catch (error) {
        logger.warn('Could not autosave the current pipeline, the previous autosave is kept', error);
        return false;
    }
};

export const clearPipelineDraft = (): void => {
    localStorage.removeItem(PIPELINE_DRAFT_KEY);
    lastWrittenFingerprint = null;
};
