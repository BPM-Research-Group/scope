import { useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { useExploreFlow } from '~/hooks/useExploreFlow';
import { useFileDialogStore, useStoredFiles } from '~/stores/store';
import type { ExtendedFile } from '~/types/fileObject.types';
import FileShowcase from './FileShowcase';

interface FileSelectionDialogProps {
    isOpen: boolean;
}

const FileSelectionDialog: React.FC<FileSelectionDialogProps> = ({ isOpen }) => {
    const { dialogNodeId, closeDialog } = useFileDialogStore();
    const { files } = useStoredFiles();
    const { getNode } = useExploreFlow();

    const handleFileSelect = useCallback(
        (file: ExtendedFile) => {
            if (dialogNodeId) {
                const node = getNode(dialogNodeId);
                if (node && node.data.onDataChange) {
                    // Add the selected file as an asset to the node
                    const newAsset = { fileName: file.name, fileId: file.id };
                    const updatedAssets = [...node.data.assets, newAsset];
                    node.data.onDataChange(dialogNodeId, { assets: updatedAssets });
                }
            }
            closeDialog();
        },
        [dialogNodeId, getNode, closeDialog]
    );

    const handleEscapeKey = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape' && dialogNodeId) {
                closeDialog();
            }
        },
        [dialogNodeId, closeDialog]
    );

    // Handle Escape key
    useEffect(() => {
        if (dialogNodeId) {
            document.addEventListener('keydown', handleEscapeKey);
            return () => document.removeEventListener('keydown', handleEscapeKey);
        }
    }, [dialogNodeId, handleEscapeKey]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg pointer-events-auto">
                <button
                    onClick={closeDialog}
                    className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                </button>
                <div className="flex flex-col space-y-1.5 text-center sm:text-left">
                    <h2 className="text-lg font-semibold leading-none tracking-tight">
                        Choose Event Log From Your Data
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        If you want to upload a new event log please go to the data page
                    </p>
                    {files.map((file) => (
                        <FileShowcase key={file.id} file={file} onFileSelect={handleFileSelect} />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default FileSelectionDialog;
