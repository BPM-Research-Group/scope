import { memo, useCallback } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Grip } from 'lucide-react';
import BaseFileNode from '~/components/explore/file/BaseFileNode';
import ViewerLink from '~/components/explore/ui/ViewerLink';
import { FileNode } from '~/types/explore/nodes';
import { useMutation } from '@tanstack/react-query';
import { exportcaseCollectionPm4py } from '~/services/api';
import { toast } from 'sonner';


const OcelCollectionNode = memo<NodeProps<FileNode>>((props) => {
    const hasFile = props.data.assets.length > 0;
    let assetId = hasFile ? props.data.assets[0].id : null;

    const exportMutation = useMutation({
        mutationFn: () => exportcaseCollectionPm4py(assetId!),
        onSuccess: (result) => {
            toast.success(`Exported to Downloads`, { description: result.filename });
        },
        onError: () => {
            toast.error('Export failed', { description: 'Could not export Case Collection as PM4PY.' });
        },
    });

    const handleDropdownAction = useCallback(
            (action: string) => {
                if (action === 'exportPm4pyCaseOcel') exportMutation.mutate();
            },
            [exportMutation]
        );

    return (
        <BaseFileNode
            {...props}
            title="Case Collection"
            iconName="fileStack"
            handleOptions={[{ id: 'source', position: Position.Right, type: 'source' as const }]}
            dropdownOptions={[{ label: 'Open File', action: 'openFileDialog' as const, icon: 'file' }, 
                ...(hasFile
                    ? [{ label: 'Export as PM4PY', action: 'exportPm4pyCaseOcel' as const, icon: 'download' }]
                    : []),
            ]}
            onDropdownAction={handleDropdownAction}
        >
            {hasFile && (
                <div className="mt-2 border-t pt-2">
                    <p className="text-xs font-semibold text-gray-500 mb-2">Visualizations</p>
                    <div className="flex flex-col gap-1">
                        <ViewerLink
                            to={`/data/pipeline/explore/ocel/${props.id}`}
                            icon={Grip}
                            iconClassName="text-blue-500"
                            label="Object Event Graph"
                        />
                    </div>
                </div>
            )}
        </BaseFileNode>
    );
});

export default OcelCollectionNode;
