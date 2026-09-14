import { useExploreFlowStore } from '~/stores/exploreStore';

const EXPLORE_PATH = '/data/pipeline/explore';

/**
 * Viewer routes are the node-scoped pages below the explore canvas, e.g.
 * `/data/pipeline/explore/ocpt/<nodeId>`. They are the pages that can be opened
 * in a browser tab of their own.
 */
export const isViewerPath = (pathname: string): boolean => {
    const trimmed = pathname.replace(/\/+$/, '');
    if (!trimmed.startsWith(`${EXPLORE_PATH}/`)) return false;
    return trimmed.slice(EXPLORE_PATH.length + 1).split('/').filter(Boolean).length >= 2;
};

let openedAsViewerTab = false;

/**
 * True when this browser tab was opened directly on a viewer route, i.e. it is a
 * detached viewer rather than the tab that owns the explore canvas.
 */
export const isDetachedViewerTab = (): boolean => openedAsViewerTab;

/**
 * A tab opened on a viewer route starts with an empty flow store, so the viewer
 * would not find its node. Seed the store from the autosaved draft instead.
 * Call once at startup, before rendering.
 */
export const hydrateDetachedViewerTab = (): void => {
    if (!isViewerPath(window.location.pathname)) return;

    openedAsViewerTab = true;

    const store = useExploreFlowStore.getState();
    if (store.nodes.length > 0) return;

    store.restorePipelineDraft();
};
