import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Pickaxe } from 'lucide-react';
import BaseExploreNode from '~/components/explore/BaseExploreNode';
import { useNodeQuery } from '~/hooks/useNodeQuery';
import type { BaseExploreNodeDropdownActionType, MinerNode } from '~/types/explore';

const MinerExploreNode = memo<NodeProps<MinerNode>>((props) => {
    const { id, data } = props;
    const { assets, queryConfig } = data;
    const { isLoading } = useNodeQuery(queryConfig, assets, id);

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
        if (assets.length === 0) return <p>No file</p>;

        const asset = assets[0];
        console.log(asset);

        // Show mining animation when loading OCEL files
        if (isLoading) {
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
                <div>
                    <p>Input Files</p>
                    {assets.map((asset, index) => {
                        if (asset.origin != 'mined') {
                            return (
                                <div key={index} className="text-sm text-gray-600">
                                    {asset.type === 'ocelFile' ? '⛏️' : '📄'} {asset.name}
                                </div>
                            );
                        }
                    })}
                </div>
                <div>
                    <p>Output Files</p>
                    {assets.map((asset, index) => {
                        if (asset.origin === 'mined') {
                            return (
                                <div key={index} className="text-sm text-gray-600">
                                    {asset.type === 'ocelFile' ? '⛏️' : '📄'} {asset.name}
                                </div>
                            );
                        }
                    })}
                </div>
            </div>
        );
    };

    return <BaseExploreNode {...props} onDropdownAction={handleDropdownAction} customContent={renderFileContent()} />;
});

export default MinerExploreNode;
