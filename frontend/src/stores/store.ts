import type { HierarchyPointNode } from '@visx/hierarchy/lib/types';
import { scaleOrdinal } from '@visx/scale';
import type { ScaleOrdinal } from 'd3-scale';
import { schemeSet1 } from 'd3-scale-chromatic';
import { create } from 'zustand';
import type { FlowJson } from '~/types/flow/flow.types';
import type { ObjectFlowMapRecord, OcelEventData } from '~/types/ocel.types';
import { type JSONSchema, type TreeNode } from '~/types/ocpt/ocpt.types';

// Used for Dropzone and File Management
interface FileID {
    fileID: number;
    setFileID: (fileID: number) => void;
}

interface AcceptedFile {
    acceptedFile: File | null;
    setAcceptedFile: (acceptedFile: File | null) => void;
}

interface JSONFile {
    jsonFile: JSONSchema | null;
    setJSONFile: (data: JSONSchema) => void;
}

interface OcelFile {
    ocelFile: OcelEventData[] | null;
    setOcelFile: (data: OcelEventData[]) => void;
}

interface FileStore {
    files: File[];
    addFile: (file: File) => void;
    removeFile: (file: File) => void;
    clearFiles: () => void;
}

interface UseFilteredObjectType {
    filteredObjectTypes: string[];
    setFilteredObjectTypes: (filteredObjectTypes: string[]) => void;
}

interface ColorScaleState {
    colorScale: ScaleOrdinal<string, string, never>;
    objectTypes: string[];
    setColorScaleObjectTypes: (types: string[]) => void;
    updateColorScale: () => void;
}

interface RenderedOcptStore {
    renderedOcpt: HierarchyPointNode<TreeNode> | null;
    setRenderedOcpt: (newRenderedOcpt: HierarchyPointNode<TreeNode> | null) => void;
}

interface OriginalRenderedOcptStore {
    originalRenderedOcpt: HierarchyPointNode<TreeNode> | null;
    setOriginalRenderedOcpt: (newRenderedOcpt: HierarchyPointNode<TreeNode> | null) => void;
}

interface IsOcptModeStore {
    isOcptMode: boolean;
    setIsOcptMode: (newIsOcptMode: boolean) => void;
}

interface FlowJsonStore {
    flowJson: FlowJson | null;
    setFlowJson: (newFlowJson: FlowJson) => void;
}

interface OcelStore {
    ocel: OcelEventData[];
    setOcel: (newOcel: OcelEventData[]) => void;
}

interface ObjectFlowMap {
    objectFlowMap: ObjectFlowMapRecord;
    setObjectFlowMap: (newObjectFlowMap: ObjectFlowMapRecord) => void;
}

interface GlobalCurrentTimeMs {
    globalCurrentTimeMs: number;
    setGlobalCurrentTimeMs: (newTime: number) => void;
}

interface PlaybackStore {
    isPlaying: boolean;
    setIsPlaying: (value: boolean) => void;

    speedMultiplier: number;
    setSpeedMultiplier: (value: number) => void;

    playbackSpeedInS: number;
    setPlaybackSpeedInS: (value: number) => void;
}

export const useFileID = create<FileID>()((set) => ({
    fileID: 0,
    setFileID: (newFileID) => set((state) => ({ fileID: newFileID })),
}));

export const useAcceptedFile = create<AcceptedFile>((set) => ({
    acceptedFile: null,
    setAcceptedFile: (newAcceptedFile) => set((state) => ({ acceptedFile: newAcceptedFile })),
}));

export const useJSONFile = create<JSONFile>((set) => ({
    jsonFile: null,
    setJSONFile: (newJSONFile) => set((state) => ({ jsonFile: newJSONFile })),
}));

export const useOcelFile = create<OcelFile>((set) => ({
    ocelFile: null,
    setOcelFile: (newOcelFile) => set(() => ({ ocelFile: newOcelFile })),
}));

export const useStoredFiles = create<FileStore>((set) => ({
    files: [],
    addFile: (file) => set((state) => ({ files: [...state.files, file] })),
    removeFile: (file) => set((state) => ({ files: state.files.filter((f) => f !== file) })),
    clearFiles: () => set((state) => ({ files: [] })),
}));

export const useFilteredObjectType = create<UseFilteredObjectType>((set) => ({
    filteredObjectTypes: [],
    setFilteredObjectTypes: (newFilteredObjectTypes) => set(() => ({ filteredObjectTypes: newFilteredObjectTypes })),
}));

// Create the store
export const useColorScaleStore = create<ColorScaleState>((set, get) => ({
    colorScale: scaleOrdinal({
        domain: [] as string[],
        range: schemeSet1.slice(),
    }),
    objectTypes: [],

    setColorScaleObjectTypes: (types: string[]) => {
        set({ objectTypes: types });
        get().updateColorScale();
    },

    updateColorScale: () => {
        const { objectTypes } = get();
        const newColorScale = scaleOrdinal({
            domain: objectTypes,
            range: schemeSet1.slice(),
        });
        set({ colorScale: newColorScale });
    },
}));

export const useRenderedOcpt = create<RenderedOcptStore>((set) => ({
    renderedOcpt: null,
    setRenderedOcpt: (newRenderedOcpt) => set(() => ({ renderedOcpt: newRenderedOcpt })),
}));

export const useIsOcptMode = create<IsOcptModeStore>((set) => ({
    isOcptMode: true,
    setIsOcptMode: (newIsOcptMode) => set(() => ({ isOcptMode: newIsOcptMode })),
}));

export const useFlowJson = create<FlowJsonStore>((set) => ({
    flowJson: null,
    setFlowJson: (newFlowJson) => set(() => ({ flowJson: newFlowJson })),
}));

export const useOriginalRenderedOcpt = create<OriginalRenderedOcptStore>((set) => ({
    originalRenderedOcpt: null,
    setOriginalRenderedOcpt: (newOriginalRenderedOcpt) =>
        set(() => ({ originalRenderedOcpt: newOriginalRenderedOcpt })),
}));

export const useObjectFlowMap = create<ObjectFlowMap>((set) => ({
    objectFlowMap: new Map(),
    setObjectFlowMap: (newObjectFlowMap) => set(() => ({ objectFlowMap: newObjectFlowMap })),
}));

export const useOcel = create<OcelStore>((set) => ({
    ocel: [],
    setOcel: (newOcel) => set(() => ({ ocel: newOcel })),
}));

export const useGlobalCurrentTimeMs = create<GlobalCurrentTimeMs>((set) => ({
    globalCurrentTimeMs: 0,
    setGlobalCurrentTimeMs: (newTime) => set(() => ({ globalCurrentTimeMs: newTime })),
}));

export const usePlaybackStore = create<PlaybackStore>((set) => ({
    isPlaying: false,
    setIsPlaying: (value) => set({ isPlaying: value }),

    speedMultiplier: 1, //1x
    setSpeedMultiplier: (value) => set({ speedMultiplier: value }),

    playbackSpeedInS: 60, // 1 minute
    setPlaybackSpeedInS: (value) => set({ playbackSpeedInS: value }),
}));

interface ActivityExecution {
    activity: string;
    timestamp: string;
    tokenIds: string[];
    tokenTypes: Map<string, string>;
}

interface ActivityExecutionStore {
    activityExecutions: Map<string, ActivityExecution[]>;
    addActivityExecution: (activity: string, timestamp: string, tokenId: string, tokenType: string) => void;
    clearActivityExecutions: () => void;
}

export const useActivityExecutionStore = create<ActivityExecutionStore>((set, get) => ({
    activityExecutions: new Map(),

    addActivityExecution: (activity: string, timestamp: string, tokenId: string, tokenType: string) => {
        set((state) => {
            const newMap = new Map(state.activityExecutions);
            const executions = newMap.get(activity) || [];

            const existingExecution = executions.find((e) => e.timestamp === timestamp);

            if (existingExecution) {
                if (!existingExecution.tokenIds.includes(tokenId)) {
                    existingExecution.tokenIds.push(tokenId);
                    existingExecution.tokenTypes.set(tokenId, tokenType);
                }
            } else {
                executions.push({
                    activity,
                    timestamp,
                    tokenIds: [tokenId],
                    tokenTypes: new Map([[tokenId, tokenType]]),
                });
            }

            newMap.set(activity, executions);
            return { activityExecutions: newMap };
        });
    },

    clearActivityExecutions: () => set({ activityExecutions: new Map() }),
}));
