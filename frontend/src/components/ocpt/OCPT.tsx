import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Group } from '@visx/group';
import { hierarchy } from '@visx/hierarchy';
import { HierarchyNode, HierarchyPointNode } from '@visx/hierarchy/lib/types';
import { ParentSize } from '@visx/responsive';
import { Zoom } from '@visx/zoom';
import type { ProvidedZoom, TransformMatrix } from '@visx/zoom/lib/types';
import { ScaleOrdinal } from 'd3';
import IdentityRelationViewer from '~/components/identity_relations/IdentityRelationViewer';
import { RenderTree } from '~/components/ocpt/OcptRendering';
import NodeTooltip from '~/components/ocpt/ui/NodeTooltip';
import ZoomButtons from '~/components/ocpt/ui/ZoomButtons';
import { isExtendedProcessTreeOperatorNode, isIdentityOperatorApi } from '~/lib/ocpt/ocptGuards';
import { VisualizationNode } from '~/types/explore/nodes';
import { type Node } from '~/types/ocpt/ocpt.types';

// Cast needed due to @visx/zoom + @types/react@18 incompatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TypedZoom = Zoom as any; // We need to do this as there is some issue with the React version and visx

export type OCPTProps = {
    width?: number;
    height?: number;
    margin?: { top: number; right: number; bottom: number; left: number };
    treeData: Node | null;
    colorScale: ScaleOrdinal<string, string, never>;
    node?: VisualizationNode;
    filteredObjectTypes?: string[];
    showDetails?: boolean;
    isIdentityOcpt?: boolean;
    onExportReady?: (exportFn: () => void) => void;
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
    node,
    filteredObjectTypes: filteredObjectTypesProp,
    showDetails,
    isIdentityOcpt,
    onExportReady,
}) => {
    const [hoveredNode, setHoveredNode] = useState<HierarchyPointNode<Node> | null>(null);
    const [clickedNode, setClickedNode] = useState<HierarchyPointNode<Node> | null>(null);
    const [tree, setTree] = useState<HierarchyNode<Node> | null>(null);
    const treeGroupRef = useRef<SVGGElement>(null);
    const viewState = node?.data.viewState;
    const filteredObjectTypes = filteredObjectTypesProp ?? viewState?.filteredObjectTypes ?? [];

    const identityData = useMemo(() => {
        if (!clickedNode) return null;
        const value = clickedNode.data.value;

        const otsFromRelations = (relations: { left: string[]; right: string[] }[]) => {
            const s = new Set<string>();
            relations.forEach((r) => {
                r.left.forEach((ot) => s.add(ot));
                r.right.forEach((ot) => s.add(ot));
            });
            return s;
        };

        const operatorLabel: Record<string, string> = {
            sequence: 'Sequence',
            parallel: 'Parallel',
            loop: 'Loop',
            xor: 'XOR',
        };

        if (isExtendedProcessTreeOperatorNode(value)) {
            const relations = value.identity ?? [];
            const otSet = otsFromRelations(relations);
            value.ots.forEach((ot) => otSet.add(ot.ot));
            return {
                title: operatorLabel[value.operator] ?? value.operator,
                objectTypes: Array.from(otSet),
                relations,
            };
        }
        if (isIdentityOperatorApi(value)) {
            const relations = value.identity ?? [];
            return {
                title: operatorLabel[value.operator] ?? value.operator,
                objectTypes: Array.from(otsFromRelations(relations)),
                relations,
            };
        }
        return null;
    }, [clickedNode]);

    useEffect(() => {
        const copyTreeData = JSON.parse(JSON.stringify(treeData));
        if (!copyTreeData) return;

        setTree(hierarchy(copyTreeData, (d) => (d!.isExpanded ? null : d!.children)));
    }, [treeData]);

    const exportSvg = useCallback(() => {
        const treeGroup = treeGroupRef.current;
        if (!treeGroup) return;

        const svgEl = treeGroup.closest('svg');
        if (!svgEl) return;

        // getBBox() returns coords in the group's local space.
        // The group has translate(margin.left, margin.top), so offset
        const bbox = treeGroup.getBBox();
        const padding = 20;
        const x = bbox.x + margin.left;
        const y = bbox.y + margin.top;

        const cloned = svgEl.cloneNode(true) as SVGSVGElement;

        // Remove the zoom transform s.t. the tree is fully in the image
        const zoomG = cloned.querySelector('g');
        if (zoomG) {
            zoomG.removeAttribute('transform');
        }

        cloned.setAttribute(
            'viewBox',
            `${x - padding} ${y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`
        );
        cloned.setAttribute('width', `${bbox.width + padding * 2}`);
        cloned.setAttribute('height', `${bbox.height + padding * 2}`);
        cloned.style.cursor = '';
        cloned.style.touchAction = '';

        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(cloned);
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ocpt.svg';
        a.click();
        URL.revokeObjectURL(url);
    }, [margin]);

    useEffect(() => {
        onExportReady?.(exportSvg);
    }, [exportSvg, onExportReady]);

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

    const sizeWidth = innerWidth;
    const sizeHeight = innerHeight;

    if (!treeData) {
        return <div>Loading...</div>;
    }

    return (
        tree && (
            <div className="h-full w-full">
                <TypedZoom
                    width={width}
                    height={height}
                    scaleXMin={1 / 2}
                    scaleXMax={4}
                    scaleYMin={1 / 2}
                    scaleYMax={4}
                    initialTransformMatrix={initialTransform}
                >
                    {(
                        zoom: ProvidedZoom<SVGSVGElement> & { isDragging: boolean; transformMatrix: TransformMatrix }
                    ) => (
                        <div className="relative w-full h-full">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width={width}
                                height={height}
                                style={{
                                    cursor: zoom.isDragging ? 'grabbing' : 'grab',
                                    touchAction: 'none',
                                }}
                                ref={zoom.containerRef}
                            >
                                <g transform={zoom.toString()}>
                                    <Group top={margin.top} left={margin.left} innerRef={treeGroupRef}>
                                        <RenderTree
                                            rootNode={tree}
                                            filteredObjectTypes={filteredObjectTypes}
                                            setHoveredNode={setHoveredNode}
                                            colorScale={colorScale}
                                            sizeWidth={sizeWidth}
                                            sizeHeight={sizeHeight}
                                            showDetails={showDetails}
                                            onOperatorClick={isIdentityOcpt ? setClickedNode : undefined}
                                        />
                                    </Group>
                                </g>
                            </svg>
                            <ZoomButtons zoom={zoom} />
                            <IdentityRelationViewer
                                open={clickedNode !== null}
                                onOpenChange={(open) => {
                                    if (!open) setClickedNode(null);
                                }}
                                title={identityData?.title}
                                objectTypes={identityData?.objectTypes ?? []}
                                relations={identityData?.relations ?? []}
                                getObjectColor={colorScale}
                            />
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
                </TypedZoom>
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
