import React, { useEffect, useState } from 'react';
import { useExploreFlowStore, type SavedPipeline } from '~/stores/exploreStore';
import PipelineShowcase from './PipelineShowcase';

const PipelineList: React.FC = () => {
    const { getSavedPipelines, deletePipeline } = useExploreFlowStore();
    const [pipelines, setPipelines] = useState<SavedPipeline[]>([]);

    useEffect(() => {
        setPipelines(getSavedPipelines());
    }, [getSavedPipelines]);

    const handleDelete = (pipelineId: string) => {
        deletePipeline(pipelineId);
        setPipelines(getSavedPipelines());
    };

    if (pipelines.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12">
                <p className="text-gray-500 text-lg">No saved pipelines yet</p>
                <p className="text-gray-400 text-sm mt-2">Create and save pipelines in the explore page</p>
            </div>
        );
    }

    return (
        <div className="w-full mt-2">
            {pipelines.map((pipeline) => (
                <PipelineShowcase 
                    key={pipeline.id} 
                    pipeline={pipeline} 
                    onDelete={handleDelete}
                />
            ))}
        </div>
    );
};

export default PipelineList;