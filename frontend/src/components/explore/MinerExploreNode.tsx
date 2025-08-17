import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import BaseExploreNode from '~/components/explore/BaseExploreNode';
import type { MinerNode } from '~/types/explore';

const MinerExploreNode = memo<NodeProps<MinerNode>>((props) => {
    const { id, selected, data } = props;

    const renderFileContent = () => {
        const { assets } = data;

        if (assets.length === 0) {
            return <p>No file selected</p>;
        }

        return (
            <div>
                <p>Selected files: {assets.length}</p>
                {assets.map((asset, index) => (
                    <div key={index} className="text-sm text-gray-600">
                        File name: {asset.fileName}
                    </div>
                ))}
            </div>
        );
    };

    return <BaseExploreNode {...props} onDropdownAction={() => {}} customContent={renderFileContent()} />;
});

export default MinerExploreNode;
