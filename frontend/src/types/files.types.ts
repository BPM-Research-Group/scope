export const fileTypes = ['ocptFile', 'ocelFile'] as const;
export type FileType = (typeof fileTypes)[number];

export const otherTypes = ['ocptAsset'] as const;
export type OtherType = (typeof otherTypes)[number];

export const assetTypes = [...fileTypes, ...otherTypes] as const;
export type AssetType = (typeof assetTypes)[number];
