import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Grip } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import { useGetOcelCollection } from '~/services/queries';
import { FileNode } from '~/types/explore/nodes';

const OcelCollectionNode = memo<NodeProps<FileNode>>((props) => {
    const navigate = useNavigate();
    const hasFile = props.data.assets.length > 0;
    const { data } = useGetOcelCollection(props.data.assets[0].id);
    console.log(data);

    const openObjectEventGraph = () => {
        navigate(`/data/pipeline/explore/ocel/${props.id}`);
    };

    return (
        <BaseFileNode
            {...props}
            title="OCEL Collection"
            iconName="fileStack"
            handleOptions={[{ position: Position.Right, type: 'source' as const }]}
            dropdownOptions={[{ label: 'Open File', action: 'openFileDialog' as const, icon: 'file' }]}
        >
            {hasFile && (
                <div className="mt-2 border-t pt-2">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Visualizations</p>
                    <div className="flex flex-col gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full justify-start h-7 px-2 text-xs"
                            onClick={openObjectEventGraph}
                        >
                            <Grip className="h-3.5 w-3.5 text-blue-500" />
                            Object Event Graph
                        </Button>
                    </div>
                </div>
            )}
        </BaseFileNode>
    );
});

export default OcelCollectionNode;
