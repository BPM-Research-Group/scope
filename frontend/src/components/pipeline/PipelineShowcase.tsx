import React from 'react';
import { Calendar, FileText, Play, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { useExploreFlowStore, type SavedPipeline } from '~/stores/exploreStore';

interface PipelineShowcaseProps {
    pipeline: SavedPipeline;
    onDelete: (pipelineId: string) => void;
}

const PipelineShowcase: React.FC<PipelineShowcaseProps> = ({ pipeline, onDelete }) => {
    const navigate = useNavigate();
    const { loadPipeline } = useExploreFlowStore();

    const handleLoad = () => {
        loadPipeline(pipeline.id);
        navigate('/data/pipeline/explore');
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="flex items-center h-16 w-full border-gray-200 border-y-[1px]">
            <div className="flex justify-center items-center ml-4">
                <FileText className="h-6 w-6 mr-3 text-blue-500" />
                <div className="flex flex-col">
                    <p className="font-semibold">{pipeline.name}</p>
                    <div className="flex items-center text-sm text-gray-500">
                        <Calendar className="h-3 w-3 mr-1" />
                        <span>{formatDate(pipeline.savedAt)}</span>
                    </div>
                </div>
            </div>
            <div className="flex items-center ml-auto mr-4 space-x-2">
                <Button
                    onClick={handleLoad}
                    size="sm"
                    className="bg-green-500 hover:bg-green-600 text-white"
                >
                    <Play className="h-4 w-4 mr-1" />
                    Load
                </Button>
                <Button
                    onClick={() => onDelete(pipeline.id)}
                    size="sm"
                    variant="destructive"
                >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                </Button>
            </div>
        </div>
    );
};

export default PipelineShowcase;