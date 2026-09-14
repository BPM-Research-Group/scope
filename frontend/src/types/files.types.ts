export const fileTypes = ['ocptFile', 'ocelFile', 'ocpnFile', 'ocpfFile', 'ocelCollectionFile'] as const;
export type FileType = (typeof fileTypes)[number];
export const otherTypes = [
    'ocptAsset',
    'ocelAsset',
    'ocpnAsset',
    'ocpfAsset',
    'identityOcptAsset',
    'abstractionAsset',
    'conformanceAsset',
    'flowAsset',
] as const;

export type OtherType = (typeof otherTypes)[number];

export const assetTypes = [...fileTypes, ...otherTypes] as const;
export type AssetType = (typeof assetTypes)[number];
export interface ExtendedFile extends File {
    id: string;
    fileType: FileType;
}
