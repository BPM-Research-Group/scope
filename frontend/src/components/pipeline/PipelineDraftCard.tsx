import React from 'react';
import { Clock, History, RotateCcw, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { PipelineDraft } from '~/lib/explore/pipelineDraft';

interface PipelineDraftCardProps {
    draft: PipelineDraft;
    onDiscard: () => void;
}

const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

const PipelineDraftCard: React.FC<PipelineDraftCardProps> = ({ draft, onDiscard }) => {
    const navigate = useNavigate();
    const { restorePipelineDraft } = useExploreFlowStore();

    const handleRestore = () => {
        if (restorePipelineDraft()) {
            navigate('/data/pipeline/explore');
        }
    };

    const nodeCount = draft.nodes.length;

    return (
        <div className="w-full border-[1px] rounded-lg border-blue-500 border-opacity-40 bg-blue-50 mt-4">
            <div className="flex items-center h-16 w-full">
                <div className="flex justify-center items-center ml-4">
                    <History className="h-6 w-6 mr-3 text-blue-500" />
                    <div className="flex flex-col">
                        <p className="font-semibold">
                            Restore current Pipeline
                            {draft.pipelineName && (
                                <span className="font-normal text-gray-600"> — {draft.pipelineName}</span>
                            )}
                        </p>
                        <div className="flex items-center text-sm text-gray-500">
                            <Clock className="h-3 w-3 mr-1" />
                            <span>
                                {nodeCount} {nodeCount === 1 ? 'node' : 'nodes'} · last edited {formatDate(draft.savedAt)}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center ml-auto mr-4 space-x-2">
                    <Button onClick={handleRestore} size="sm" className="bg-blue-500 hover:bg-blue-600 text-white">
                        <RotateCcw className="h-4 w-4 mr-1" />
                        Restore
                    </Button>
                    <Button onClick={onDiscard} size="sm" variant="outline">
                        <Trash2 className="h-4 w-4 mr-1" />
                        Discard
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default PipelineDraftCard;
