import { useCallback, useState } from 'react';
import { FileUp } from 'lucide-react';
import { DropEvent, FileRejection, useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import { useStoredFiles } from '~/stores/store';
import { useUploadFileMutation } from '~/services/mutation';
import type { ExtendedFile } from '~/types/fileObject.types';
import type { FileType } from '~/types/files.types';
import FileTypeSelectionDialog from './explore/file/ui/FileTypeSelectionDialog';

const Dropzone: React.FC = () => {
    // const { setAcceptedFile } = useAcceptedFile();
    const { addFile } = useStoredFiles();
    const uploadFileMutation = useUploadFileMutation();
    const [isFileTypeDialogOpen, setIsFileTypeDialogOpen] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);

    const onDropAccepted = async (acceptedFiles: File[]) => {
        //Accepted Files is always an Array in React-Dropzone even if maxFiles is set to 1
        const file = acceptedFiles[0];
        setPendingFile(file);
        setIsFileTypeDialogOpen(true);
    };

    const handleFileTypeSelect = useCallback(
        async (fileType: FileType) => {
            if (pendingFile) {
                const fileWithId = Object.assign(pendingFile, {
                    id: uuidv4(),
                    fileType,
                }) as ExtendedFile;

                addFile(fileWithId);
                uploadFileMutation.mutate(fileWithId);

                setPendingFile(null);
            }
        },
        [pendingFile, addFile, uploadFileMutation]
    );

    const handleCloseDialog = useCallback(() => {
        setIsFileTypeDialogOpen(false);
        setPendingFile(null);
    }, []);

    const onDropRejected = async (rejectedFiles: FileRejection[], event: DropEvent) => {
        //Can be used to display error messages in the future
    };

    const { getRootProps, getInputProps } = useDropzone({
        onDropRejected,
        onDropAccepted,
        accept: {
            'text/csv': ['.csv'],
            'application/json': ['.json', '.jsonocel'],
        },
        maxFiles: 1,
    });

    return (
        <>
            <div
                className="flex flex-col items-center justify-center mt-4 border-[1px] rounded-3xl border-black border-opacity-25 h-48 w-full hover:border-blue-500 hover:shadow-lg transition-all duration-200"
                {...getRootProps()}
            >
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                    <FileUp className="w-10 h-10 text-blue-500" />
                </div>
                <p className=" text-gray-600 text-xl text-center mt-4">
                    <span className="text-blue-500 font-semibold cursor-pointer">Click here </span>
                    to upload your file or drag.
                </p>
                <p className="text-gray-400 text-l text-center">
                    Accepted file types: <span className="font-semibold">.csv, .json</span>
                </p>
                <input {...getInputProps()} />
            </div>

            <FileTypeSelectionDialog
                isOpen={isFileTypeDialogOpen}
                onFileTypeSelect={handleFileTypeSelect}
                onClose={handleCloseDialog}
            />
        </>
    );
};

export default Dropzone;
