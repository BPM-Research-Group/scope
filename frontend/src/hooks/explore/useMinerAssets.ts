import { useEffect, useMemo } from 'react';
import { handleMinerOutput } from '~/lib/explore/flowActions';
import type { BaseExploreNodeAsset } from '~/types/explore/nodeData/baseNodeData';
import type { ExploreNodeType } from '~/types/explore/nodeTypesCategories';
import type { AssetType } from '~/types/files.types';

/**
 * Returns the first input asset matching the given type(s), or null.
 * Pass no types to match any input asset.
 */
export function useInputAsset(
    assets: BaseExploreNodeAsset[],
    ...types: AssetType[]
): BaseExploreNodeAsset | null {
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return useMemo(
        () => assets.find((a) => a.io === 'input' && (types.length === 0 || types.includes(a.type))) ?? null,
        // types are string literals — spreading them as primitives in deps is safe
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [assets, ...types]
    );
}

/**
 * Fires handleMinerOutput whenever outputAssetId becomes available.
 * No-ops when either outputAssetId or inputFileName is falsy.
 */
export function useMinerOutput(
    nodeId: string,
    outputAssetId: string | null | undefined,
    inputFileName: string,
    outputAssetType: AssetType,
    outputNodeType: ExploreNodeType
) {
    useEffect(() => {
        if (!outputAssetId || !inputFileName) return;
        handleMinerOutput({ nodeId, outputAssetId, outputAssetType, outputNodeType, inputFileName });
    }, [nodeId, outputAssetId, inputFileName, outputAssetType, outputNodeType]);
}
