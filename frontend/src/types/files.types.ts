export const fileTypes = ['ocptFile', 'ocelFile', 'ocpnFile', 'ocelCollectionFile'] as const;
export type FileType = (typeof fileTypes)[number];
export const otherTypes = ['ocptAsset', 'ocelAsset', 'ocpnAsset', 'identityOcptAsset', 'abstractionAsset', 'conformanceAsset'] as const;

export type OtherType = (typeof otherTypes)[number];

export const assetTypes = [...fileTypes, ...otherTypes] as const;
export type AssetType = (typeof assetTypes)[number];
export interface ExtendedFile extends File {
    id: string;
    fileType: FileType;
}
