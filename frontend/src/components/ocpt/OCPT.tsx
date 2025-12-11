import { useEffect, useState } from 'react';
import { Group } from '@visx/group';
import { hierarchy } from '@visx/hierarchy';
import { HierarchyNode, HierarchyPointNode } from '@visx/hierarchy/lib/types';
import { ParentSize } from '@visx/responsive';
import { Zoom } from '@visx/zoom';
import { ScaleOrdinal } from 'd3';
import { SIDEBAR_WIDTH } from '~/components/ui/sidebar';
import { RenderTree } from '~/components/ocpt/OcptRendering';
import NodeTooltip from '~/components/ocpt/ui/NodeTooltip';
import ZoomButtons from '~/components/ocpt/ui/ZoomButtons';
import { VisualizationNode } from '~/types/explore/nodes';
import { type TreeNode } from '~/types/ocpt/ocpt.types';

export type OCPTProps = {
    width?: number;
    height?: number;
    margin?: { top: number; right: number; bottom: number; left: number };
    treeData: TreeNode | null;
    colorScale: ScaleOrdinal<string, string, never>;
    objectTypes: string[];
    node: VisualizationNode;
};

const defaultMargin = { top: 30, left: 30, right: 30, bottom: 70 };

interface OCPTContentProps extends OCPTProps {
    width: number;
    height: number;
}

const OCPTContent: React.FC<OCPTContentProps> = ({
    width,
    height,
    margin = defaultMargin,
    treeData,
    colorScale,
    objectTypes,
    node,
}) => {
    const [hoveredNode, setHoveredNode] = useState<HierarchyPointNode<TreeNode> | null>(null);
    const [tree, setTree] = useState<HierarchyNode<TreeNode> | null>(null);
    const viewState = node.data.viewState;
    const filteredObjectTypes = viewState?.filteredObjectTypes || [];

        useEffect(() => {
            const copyTreeData = JSON.parse(JSON.stringify(treeData));
            if (!copyTreeData) return;
    
            setTree(hierarchy(copyTreeData, (d) => (d!.isExpanded ? null : d!.children)));
        }, [treeData]);
    
        if (width === 0 || height === 0) return null;
    
        const scale = 0.8;
        // innerWidth calculation can use the responsive width
        const innerWidth = width - margin.left - margin.right;
        const innerHeight = height - margin.top - margin.bottom;
    
        // Center of the content (relative to the top-left of the SVG, before zoom)
        const centerX = margin.left + innerWidth / 2;
        const centerY = margin.top + innerHeight / 2;
    
        // We want the center of the tree to align with the center of the SCREEN (viewport) horizontally.
        // translateX = ScreenCenter - ContentCenter_scaled
        const translateX = window.innerWidth / 2 - centerX * scale;
        
        // For vertical alignment, we stick to the container center to avoid overlapping with top navigation.
        const translateY = height / 2 - centerY * scale;
    
        const initialTransform = {
            scaleX: scale,
            scaleY: scale,
            translateX: translateX,
            translateY: translateY,
            skewX: 0,
            skewY: 0,
        };
    
        let sizeWidth: number;    let sizeHeight: number;

    sizeWidth = innerWidth;
    sizeHeight = innerHeight;

    if (!treeData) {
        return <div>Loading...</div>;
    }

    return (
        tree && (
            <div className="h-full w-full">
                <Zoom<SVGSVGElement>
                    width={width}
                    height={height}
                    scaleXMin={1 / 2}
                    scaleXMax={4}
                    scaleYMin={1 / 2}
                    scaleYMax={4}
                    initialTransformMatrix={initialTransform}
                >
                    {(zoom) => (
                        <div className="relative w-full h-full">
                            <svg
                                width={width}
                                height={height}
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
                            <NodeTooltip
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

const OCPT: React.FC<OCPTProps> = (props) => {
    return (
        <div className="h-full w-full">
            <ParentSize>{({ width, height }) => <OCPTContent width={width} height={height} {...props} />}</ParentSize>
        </div>
    );
};

export default OCPT;
