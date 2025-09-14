import { memo, useEffect, useMemo, useState } from 'react';
import type { NodeProps } from '@xyflow/react';
import { useNavigate } from 'react-router-dom';
import BaseVisualizationNode from '~/components/explore/visualization/BaseVisualizationNode';
import { useGetOcpt } from '~/services/queries';
import type { TVisualizationNode } from '~/types/explore';

const OcptVisualizationNode = memo<NodeProps<TVisualizationNode>>((node) => {
    const [fileId, setFileId] = useState<null | string>(null);
    const { data, isLoading } = useGetOcpt(fileId);
    const navigate = useNavigate();

    const visualize = () => {
        navigate(`/data/pipeline/explore/ocpt/${node.id}`);
    };

    useMemo(() => {
        const inputAsset = node.data.assets.find((asset) => asset.io === 'input');
        if (inputAsset) setFileId(inputAsset.id);
    }, [node.data.assets]);

    useEffect(() => {
        if (data) node.data.processedData = data.ocpt;
    }, [data]);

    return <BaseVisualizationNode visualize={visualize} {...node} />;
});

export default OcptVisualizationNode;
