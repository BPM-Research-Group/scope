export const FILE_TYPES = ['ocptFile', 'ocelFile'] as const;
export type FileType = (typeof FILE_TYPES)[number];
