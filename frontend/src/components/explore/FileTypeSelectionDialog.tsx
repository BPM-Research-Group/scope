import { useCallback } from 'react';
import { Database, FileText } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import type { FileType } from '~/types/files.types';

interface FileTypeSelectionDialogProps {
    isOpen: boolean;
    onFileTypeSelect: (fileType: FileType) => void;
    onClose: () => void;
}

const FileTypeSelectionDialog: React.FC<FileTypeSelectionDialogProps> = ({ isOpen, onFileTypeSelect, onClose }) => {
    const handleFileTypeSelect = useCallback(
        (fileType: FileType) => {
            onFileTypeSelect(fileType);
            onClose();
        },
        [onFileTypeSelect, onClose]
    );

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Select File Type</DialogTitle>
                    <DialogDescription>What type of file are you adding to the flow?</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3">
                    <Button
                        onClick={() => handleFileTypeSelect('ocelFile')}
                        variant="outline"
                        className="flex items-center gap-3 h-16 justify-start p-4"
                    >
                        <Database className="h-6 w-6 text-blue-500" />
                        <div className="text-left">
                            <div className="font-medium">OCEL File</div>
                            <div className="text-sm text-muted-foreground">
                                Object-Centric Event Log (requires processing)
                            </div>
                        </div>
                    </Button>

                    <Button
                        onClick={() => handleFileTypeSelect('ocptFile')}
                        variant="outline"
                        className="flex items-center gap-3 h-16 justify-start p-4"
                    >
                        <FileText className="h-6 w-6 text-green-500" />
                        <div className="text-left">
                            <div className="font-medium">OCPT File</div>
                            <div className="text-sm text-muted-foreground">
                                Pre-processed Object-Centric Process Tree
                            </div>
                        </div>
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default FileTypeSelectionDialog;
