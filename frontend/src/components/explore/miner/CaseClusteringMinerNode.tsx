import { memo, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { NodeProps } from '@xyflow/react';
import { Position } from '@xyflow/react';
import { Eye } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '~/components/ui/button';
import BaseMinerNode from '~/components/explore/miner/BaseMinerNode';
import { useInputAsset, useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { handleMinerOutput } from '~/lib/explore/flowActions';
import { MinerNode } from '~/types/explore/nodes';

//still just Framework

const CaseClusteringMinerNode = memo<NodeProps<MinerNode>>((node) => {
    const navigate = useNavigate();
    const { id, data: nodeData } = node;
    const queryClient = useQueryClient();
    const { assets } = node.data;

    const inputAsset = useInputAsset(assets);
    const fileId = inputAsset?.id ?? null;
    const fileName = inputAsset?.name ?? '';
    const [generateOutput, setGenerateOutput] = useState(false); //sais if an output should be generated
    const [outputGenerated, setOutputGenerated] = useState(false); //sais if there is already an output
    const inputFileId = inputAsset?.id ?? null;
    const [pendingOutputId, setPendingOutputId] = useState<string | null>(null);

    const store = useExploreFlowStore();
    const params = useParams<{ nodeId: string }>();

    const handleReset = useCallback(() => {
        queryClient.removeQueries({ queryKey: ['getAbstraction', node.id] });
    }, [queryClient, node.id]);

    const openMinerInterface = () => {
        if (inputFileId) {
            navigate(`/data/pipeline/explore/caseclustering/${id}`);
        }
    };

    const renderActions = () => {
        if (!fileId) return null;
        return (
            <div className="flex items-center">
                <Button
                    onClick={() => {
                        setGenerateOutput(true);
                        openMinerInterface();
                    }} //until Vis is implemented this starts the clustering output
                    className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
                    aria-label="Configure case notion mining"
                >
                    <Eye className="h-3.5 w-3.5 mr-1 text-blue-600" />
                    <span className="text-xs text-blue-600">Configure</span>
                </Button>
            </div>
        );
    };

    useEffect(() => {
        if (!generateOutput || !outputGenerated) return;
        const outputId = uuidv4(); // new asset id for the produced output
        //Here put the linkt to the clustering algorithm/ include the functionality

        /*handleMinerOutput({
            nodeId: node.id,
            outputAssetId: outputId,
            outputAssetType: 'ocelCollectionFile',
            outputNodeType: 'ocelCollectionNode',
            inputFileName: 'clusteredData.json',*/
        const inputAssetType = inputAsset?.type ?? 'ocelFile';
        const nodeTypeMap: Record<string, string> = {
            ocelFile: 'ocelFileNode',
            ocptFile: 'ocptFileNode',
            ocelCollectionFile: 'ocelCollectionNode',
        };
        const outputNodeType = nodeTypeMap[inputAssetType] ?? 'ocelFileNode';

        handleMinerOutput({
            nodeId: node.id,
            outputAssetId: fileId,
            outputAssetType: inputAssetType,
            outputNodeType: 'ocelCollectionNode',
            inputFileName: fileName || 'input',
        });
        setOutputGenerated(true);
    }, [generateOutput, outputGenerated]);

    function consoletest() {
        console.log('knot knowledge: ', store);
        console.log('params: ', params);
    }

    // Returns new node! -> in my case it can be one or multiple OCEL collection (like notion miner)
    return (
        <BaseMinerNode
            {...node}
            title="Case Clustering Miner" //Title or node
            iconName="layers"
            handleOptions={[
                //Organises Input and output
                { id: 'target', position: Position.Left, type: 'target' as const },
                { id: 'source', position: Position.Right, type: 'source' as const },
            ]}
            dropdownOptions={[]}
            isLoading={false}
            customActions={renderActions()}
            onReset={handleReset}
        >
        </BaseMinerNode>
    );
});

export default CaseClusteringMinerNode;
