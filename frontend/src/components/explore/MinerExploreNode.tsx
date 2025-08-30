import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Pickaxe } from 'lucide-react';
import BaseExploreNode from '~/components/explore/BaseExploreNode';
import { useNodeQuery } from '~/hooks/useNodeQuery';
import type { BaseExploreNodeDropdownActionType, MinerNode } from '~/types/explore';

const MinerExploreNode = memo<NodeProps<MinerNode>>((props) => {
    const { id, data } = props;
    const { assets, queryConfig } = data;

    // Use the node's specific query configuration
    const { isLoading } = useNodeQuery(
        queryConfig,
        { fileId: assets[0]?.fileId },
        id
    );

    const handleDropdownAction = (action: BaseExploreNodeDropdownActionType) => {
        switch (action) {
            case 'openFileDialog':
                // Handle file dialog for miner node
                break;
            case 'changeSourceFile':
                // Handle source file change for miner
                break;
        }
    };

    const renderFileContent = () => {
        if (assets.length >= 2) {
            return <div>Error: Multiple input files! Please select input file manually</div>;
        }

        if (assets.length === 0) {
            return <p>No file selected</p>;
        }

        const asset = assets[0];

        // Show error for OCPT files - they don't need mining
        if (asset.fileType === 'ocptFile') {
            return (
                <div className="text-yellow-600">
                    <p>⚠️ OCPT files don't need mining</p>
                    <p className="text-xs">Connect directly to visualization</p>
                </div>
            );
        }

        // Show mining animation when loading OCEL files
        if (isLoading && asset.fileType === 'ocelFile') {
            return (
                <div className="flex flex-col items-center justify-center h-32 w-full">
                    <div className="relative mb-4">
                        <Pickaxe
                            className="h-12 w-12 text-amber-500 transform-gpu"
                            style={{
                                animation: 'mining 1.6s ease-in-out infinite',
                                transformOrigin: '80% 80%',
                            }}
                        />
                        <style>{`
                            @keyframes mining {
                                0% {
                                    transform: rotate(-30deg) translateX(0px) translateY(0px);
                                }
                                10% {
                                    transform: rotate(15deg) translateX(8px) translateY(6px);
                                }
                                20% {
                                    transform: rotate(-30deg) translateX(0px) translateY(0px);
                                }
                                30% {
                                    transform: rotate(-30deg) translateX(0px) translateY(0px);
                                }
                                40% {
                                    transform: rotate(15deg) translateX(8px) translateY(6px);
                                }
                                50% {
                                    transform: rotate(-30deg) translateX(0px) translateY(0px);
                                }
                                60% {
                                    transform: rotate(-30deg) translateX(0px) translateY(0px);
                                }
                                100% {
                                    transform: rotate(-30deg) translateX(0px) translateY(0px);
                                }
                            }
                        `}</style>
                    </div>
                    <h3 className="text-lg font-semibold text-amber-700 mb-2">Mining...</h3>
                    <p className="text-sm text-amber-600">Processing OCEL data</p>
                </div>
            );
        }

        // Show file info when ready to mine
        return (
            <div>
                <p>Mined: {assets.length} file</p>
                {assets.map((asset, index) => (
                    <div key={index} className="text-sm text-gray-600">
                        {asset.fileType === 'ocelFile' ? '⛏️' : '📄'} {asset.fileName}
                    </div>
                ))}
            </div>
        );
    };

    return <BaseExploreNode {...props} onDropdownAction={handleDropdownAction} customContent={renderFileContent()} />;
});

export default MinerExploreNode;
