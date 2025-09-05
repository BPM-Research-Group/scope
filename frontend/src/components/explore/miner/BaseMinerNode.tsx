import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Pickaxe } from 'lucide-react';
import BaseExploreNode from '~/components/explore/BaseExploreNode';
import type { TMinerNode } from '~/types/explore';
import '~/styles/animations.css';

interface MinerNodeProps extends NodeProps<TMinerNode> {
    isLoading: boolean;
}

const BaseMinerNode = memo<MinerNodeProps>(({ isLoading, ...props }) => {
    const { assets } = props.data;

    const renderFileContent = () => {
        if (assets.length === 0) return <p>Ready to mine!</p>;

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
                    </div>
                    <h3 className="text-lg font-semibold text-amber-700 mb-2">Mining...</h3>
                </div>
            );
        }

        return (
            <div>
                <div>
                    <p>Input Files</p>
                    {assets.map((asset, index) => {
                        if (asset.origin != 'mined') {
                            return (
                                <div key={index} className="text-sm text-gray-600">
                                    {'📄'}
                                    {asset.name}
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
                                    {'⛏️'}
                                    {asset.name}
                                </div>
                            );
                        }
                    })}
                </div>
            </div>
        );
    };

    return <BaseExploreNode {...props} customContent={renderFileContent()} />;
});

export default BaseMinerNode;
