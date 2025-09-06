import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { useExploreFlowStore } from '~/stores/exploreStore';

interface SavePipelineDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

const SavePipelineDialog: React.FC<SavePipelineDialogProps> = ({ isOpen, onOpenChange }) => {
    const { savePipeline } = useExploreFlowStore();
    const [pipelineName, setPipelineName] = useState('');

    const handleSave = () => {
        if (pipelineName.trim()) {
            savePipeline(pipelineName.trim());
            setPipelineName('');
            onOpenChange(false);
        }
    };

    const handleCancel = () => {
        setPipelineName('');
        onOpenChange(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Save Pipeline</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
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
                            Save
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default SavePipelineDialog;