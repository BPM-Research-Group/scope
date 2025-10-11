import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { useExploreFlowStore } from '~/stores/exploreStore';

interface SavePipelineDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    mode: 'save' | 'saveAs';
}

const SavePipelineDialog: React.FC<SavePipelineDialogProps> = ({ isOpen, onOpenChange, mode }) => {
    const { savePipeline, currentPipeline } = useExploreFlowStore();
    const [pipelineName, setPipelineName] = useState('');

    const isSaveAs = mode === 'saveAs' || !currentPipeline.id;
    const isOverwrite = mode === 'save' && !!currentPipeline.id;

    useEffect(() => {
        if (isOpen && isSaveAs) {
            setPipelineName(currentPipeline.name || '');
        } else if (!isOpen) {
            setPipelineName('');
        }
    }, [isOpen, isSaveAs, currentPipeline.name]);

    const handleSave = () => {
        if (isOverwrite && currentPipeline.id && currentPipeline.name !== null) {
            // Overwrite call with name and ID
            savePipeline(currentPipeline.name, currentPipeline.id);
            onOpenChange(false);
        } else if (isSaveAs && pipelineName.trim()) {
            // Save As call with just the new name
            savePipeline(pipelineName.trim());
            onOpenChange(false);
        }
    };

    const handleCancel = () => {
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{isOverwrite ? 'Save Pipeline' : 'Save Pipeline As'}</DialogTitle>
                    {isOverwrite && (
                        <DialogDescription>
                            This will overwrite the currently saved version of "{currentPipeline.name}".
                        </DialogDescription>
                    )}
                </DialogHeader>

                {isSaveAs ? (
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="pipeline-name">Pipeline Name</Label>
                            <Input
                                id="pipeline-name"
                                value={pipelineName}
                                onChange={(e) => setPipelineName(e.target.value)}
                                placeholder="Enter pipeline name..."
                                onKeyDown={(e) => e.key === 'Enter' && handleSave()}
                            />
                        </div>
                        <div className="flex justify-end space-x-2">
                            <Button variant="outline" onClick={handleCancel}>
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={!pipelineName.trim()}>
                                Save As
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex justify-end space-x-2 pt-4">
                        <Button variant="outline" onClick={handleCancel}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave}>Save & Overwrite</Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default SavePipelineDialog;
