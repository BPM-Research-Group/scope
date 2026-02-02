export interface ColorSlice {
    colorMaps: Record<string, Record<string, string>>;
    fileColorIndexes: Record<string, number>;
    initializeDataState: (fileId: string, objectTypes: string[]) => void;
    getColorForObject: (fileId: string, objectType: string) => string;
}
