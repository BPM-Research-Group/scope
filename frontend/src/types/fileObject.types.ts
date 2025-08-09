import type { FileType } from './files.types';

export interface ExtendedFile extends File {
    id: string;
    fileType?: FileType;
}
