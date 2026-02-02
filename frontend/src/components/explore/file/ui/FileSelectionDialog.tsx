import { useCallback, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import FileShowcase from '~/components/explore/file/ui/FileShowcase';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useFileDialogStore, useStoredFiles } from '~/stores/store';
import { BaseExploreNodeAsset } from '~/types/explore/nodeData/baseNodeData';
import { ExtendedFile } from '~/types/files.types';

interface FileSelectionDialogProps {
    isOpen: boolean;
}

const FileSelectionDialog: React.FC<FileSelectionDialogProps> = ({ isOpen }) => {
    const [filteredFiles, setFilteredFiles] = useState<ExtendedFile[]>([]);
    const { dialogNodeId, closeDialog } = useFileDialogStore();
    const { files } = useStoredFiles();
    const { getNode } = useExploreFlowStore();

    useMemo(() => {
        if (!dialogNodeId) return;

        const node = getNode(dialogNodeId);
        if (!node) return;

        const validFiles = files.filter((file) => node.data.allowedAssetTypes.includes(file.fileType));
        setFilteredFiles(validFiles);
    }, [files, dialogNodeId, getNode]);

    const handleFileSelect = useCallback(
        (file: ExtendedFile) => {
            if (dialogNodeId) {
                const node = getNode(dialogNodeId);
                if (node) {
                    const newAsset: BaseExploreNodeAsset = {
                        id: file.id,
                        name: file.name,
                        type: file.fileType,
                        origin: 'preprocessed',
                        io: 'output',
                    };
                    const updatedAssets = [...node.data.assets, newAsset];
                    node.data.onDataChange(dialogNodeId, { assets: updatedAssets });
                }
            }
            closeDialog();
        },
        [dialogNodeId, getNode, closeDialog]
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Choose a File from your Data</DialogTitle>
                    <DialogDescription>If you want to upload a new file, please visit the data page.</DialogDescription>
                </DialogHeader>
                <div className="border-y divide-y">
                    {filteredFiles.map((file) => (
                        <FileShowcase key={file.id} file={file} onFileSelect={handleFileSelect} />
                    ))}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default FileSelectionDialog;
