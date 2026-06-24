import type {
    ExploreFileNodeType,
    ExploreMinerNodeType,
    ExploreNodeCategory,
} from '~/types/explore/nodeTypesCategories';
import type { AssetType } from '~/types/files.types';

export type SidebarGroup = 'files' | 'miners';

export interface SidebarGroupMeta {
    label: string;
    icon: string;
    menuClassName: string;
}

export interface NodeInputGroup {
    label: string;
    types: readonly AssetType[];
}

export interface NodeRegistryEntry {
    category: ExploreNodeCategory;
    allowedAssetTypes: readonly AssetType[];
    /** Describes named input groups for display in the node body hint. If omitted, falls back to allowedAssetTypes. */
    inputs?: readonly NodeInputGroup[];
    /** null = not user-placeable (spawned programmatically only) */
    sidebar: { label: string; icon: string; group: SidebarGroup } | null;
}

export const sidebarGroups: Record<SidebarGroup, SidebarGroupMeta> = {
    files: { label: 'File Input', icon: 'file', menuClassName: 'flex flex-row flex-wrap gap-1' },
    miners: { label: 'Miner', icon: 'pickaxe', menuClassName: 'flex flex-row flex-wrap gap-1' },
};

// satisfies ensures every file/miner node type has a registry entry.
// Visualization nodes are excluded — no component implementations yet.
type RegistrableNodeType = ExploreFileNodeType | ExploreMinerNodeType;

export const nodeRegistry = {
    // ── File nodes ─────────────────────────────────────────────────────────────
    ocptFileNode: {
        category: 'file',
        allowedAssetTypes: ['ocptFile'],
        sidebar: { label: 'OCPT File', icon: 'fileJson', group: 'files' },
    },
    ocelFileNode: {
        category: 'file',
        allowedAssetTypes: ['ocelFile'],
        sidebar: { label: 'OCEL File', icon: 'fileSpreadsheet', group: 'files' },
    },
    ocpnFileNode: {
        category: 'file',
        allowedAssetTypes: ['ocpnFile'],
        sidebar: { label: 'OCPN File', icon: 'fileTree', group: 'files' },
    },
    ocelCollectionNode: {
        category: 'file',
        allowedAssetTypes: ['ocelCollectionFile'],
        sidebar: null,
    },
    abstractionFileNode: {
        category: 'file',
        allowedAssetTypes: ['abstractionAsset'],
        sidebar: null,
    },
    conformanceFileNode: {
        category: 'file',
        allowedAssetTypes: ['conformanceAsset'],
        sidebar: null,
    },

    // ── Miner nodes ────────────────────────────────────────────────────────────
    ocptMinerNode: {
        category: 'miner',
        allowedAssetTypes: ['ocelFile'],
        sidebar: { label: 'OCPT Miner', icon: 'treePine', group: 'miners' },
    },
    histogramMinerNode: {
        category: 'miner',
        allowedAssetTypes: ['ocelFile'],
        sidebar: { label: 'Histogram Filter', icon: 'chartBar', group: 'miners' },
    },
    caseNotionMinerNode: {
        category: 'miner',
        allowedAssetTypes: ['ocelFile'],
        sidebar: { label: 'Case Notions', icon: 'waves', group: 'miners' },
    },
    identityExtendMinerNode: {
        category: 'miner',
        allowedAssetTypes: ['ocptAsset', 'ocptFile', 'identityOcptAsset'],
        inputs: [
            { label: 'Primary', types: ['ocptAsset', 'ocptFile'] },
            { label: 'Secondary', types: ['ocelAsset', 'ocelFile'] },
        ],
        sidebar: { label: 'Extend Identity', icon: 'scanEye', group: 'miners' },
    },
    flowVisualizationNode: {
        category: 'miner',
        allowedAssetTypes: ['ocptAsset', 'ocptFile', 'identityOcptAsset'],
        inputs: [
            { label: 'OCPT', types: ['ocptAsset', 'ocptFile', 'identityOcptAsset'] },
            { label: 'OCEL', types: ['ocelAsset', 'ocelFile'] },
        ],
        sidebar: { label: 'Flow Visualization', icon: 'zap', group: 'miners' },
    },
    abstractionMinerNode: {
        category: 'miner',
        allowedAssetTypes: ['ocelFile', 'ocelAsset', 'ocptFile', 'ocptAsset', 'identityOcptAsset'],
        sidebar: { label: 'Abstraction', icon: 'layers', group: 'miners' },
    },
    ocpnMinerNode: {
        category: 'miner',
        allowedAssetTypes: ['ocptFile', 'ocptAsset'],
        sidebar: { label: 'OCPN Miner', icon: 'waypoints', group: 'miners' },
    },    
    resourceMinerNode: {
        category: 'miner',
        allowedAssetTypes: ['ocelFile'],
        sidebar: { label: 'Resource Miner', icon: 'waves', group: 'miners' },
        },
    conformanceMinerNode: {
        category: 'miner',
        allowedAssetTypes: ['ocptAsset', 'ocptFile', 'identityOcptAsset', 'ocelFile', 'ocelAsset', 'abstractionAsset'],
        inputs: [
            {
                label: 'Input A',
                types: ['ocptAsset', 'ocptFile', 'identityOcptAsset', 'ocelFile', 'ocelAsset', 'abstractionAsset'],
            },
            {
                label: 'Input B',
                types: ['ocptAsset', 'ocptFile', 'identityOcptAsset', 'ocelFile', 'ocelAsset', 'abstractionAsset'],
            },
        ],
        sidebar: { label: 'Conformance', icon: 'radar', group: 'miners' },
    },
} satisfies Record<RegistrableNodeType, NodeRegistryEntry>;
