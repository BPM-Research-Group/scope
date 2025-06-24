import { Group } from '@visx/group';
import { hierarchy } from '@visx/hierarchy';
import { Zoom } from '@visx/zoom';
import { ScaleOrdinal } from 'd3';
import { useEffect, useState } from 'react';
import ZoomButtons from '~/components/ZoomButtons';
import { type TreeNode } from '~/types/ocpt/ocpt.types';
import HoverPointTooltip from '~/components/ocpt/HoverPointTooltip';
import { HierarchyNode, HierarchyPointNode } from '@visx/hierarchy/lib/types';
import { useFilteredObjectType } from '~/stores/store';
import { RenderTree } from '~/components/ocpt/OcptRendering';

export type OCPTProps = {
    width: number;
    height: number;
    margin?: { top: number; right: number; bottom: number; left: number };
    treeData: TreeNode | null;
    colorScale: ScaleOrdinal<string, string, never>;
    objectTypes: string[];
};

const defaultMargin = { top: 30, left: 30, right: 30, bottom: 70 };

const OCPT: React.FC<OCPTProps> = ({
    width: totalWidth,
    height: totalHeight,
    margin = defaultMargin,
    treeData,
    colorScale,
    objectTypes,
}) => {
    const [hoveredNode, setHoveredNode] = useState<HierarchyPointNode<TreeNode> | null>(null);
    const [tree, setTree] = useState<HierarchyNode<TreeNode> | null>(null);
    const { filteredObjectTypes } = useFilteredObjectType();

    useEffect(() => {
        const copyTreeData = JSON.parse(JSON.stringify(treeData));
        if (!copyTreeData || filteredObjectTypes.length > 0) return;

        setTree(hierarchy(copyTreeData, (d) => (d!.isExpanded ? null : d!.children)));
    }, [treeData]);

    const initialTransform = {
        scaleX: 0.8,
        scaleY: 0.8,
        translateX: 0,
        translateY: 0,
        skewX: 0,
        skewY: 0,
    };

    const innerWidth = totalWidth - margin.left - margin.right;
    const innerHeight = totalHeight - margin.top - margin.bottom;

    let origin: { x: number; y: number };
    let sizeWidth: number;
    let sizeHeight: number;

    origin = { x: 0, y: 0 };

    sizeWidth = innerWidth;
    sizeHeight = innerHeight;

    if (!treeData) {
        return <div>Loading...</div>;
    }

    return (
        tree && (
            <div className="h-full w-full">
                <Zoom<SVGSVGElement>
                    width={totalWidth}
                    height={totalHeight}
                    scaleXMin={1 / 2}
                    scaleXMax={4}
                    scaleYMin={1 / 2}
                    scaleYMax={4}
                    initialTransformMatrix={initialTransform}
                >
                    {(zoom) => (
                        <div className="relative w-full h-full">
                            <svg
                                width="100%"
                                height="100%"
                                style={{
                                    cursor: zoom.isDragging ? 'grabbing' : 'grab',
                                    touchAction: 'none',
                                }}
                                ref={zoom.containerRef}
                            >
                                <g transform={zoom.toString()}>
                                    <Group top={margin.top} left={margin.left}>
                                        <RenderTree
                                            rootNode={tree}
                                            objectTypes={objectTypes}
                                            filteredObjectTypes={filteredObjectTypes}
                                            setHoveredNode={setHoveredNode}
                                            colorScale={colorScale}
                                            sizeWidth={sizeWidth}
                                            sizeHeight={sizeHeight}
                                        />
                                    </Group>
                                </g>
                            </svg>
                            <ZoomButtons zoom={zoom} />
                            <HoverPointTooltip
                                hoverPoint={
                                    hoveredNode && {
                                        x: hoveredNode.x,
                                        y: hoveredNode.y,
                                        data: hoveredNode.data,
                                    }
                                }
                                transformMatrix={zoom.transformMatrix}
                                coloring={colorScale}
                            />
                        </div>
                    )}
                </Zoom>
            </div>
        )
    );
};

export default OCPT;
