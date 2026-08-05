import { useEffect, useRef, useState } from 'react';
import { Group } from '@visx/group';
import { Tree } from '@visx/hierarchy';
import { HierarchyNode, HierarchyPointLink, HierarchyPointNode } from '@visx/hierarchy/lib/types';
import { type ScaleOrdinal } from 'd3-scale';
import { cloneDeep } from 'lodash-es';
import OcptLink from '~/components/ocpt/links/OcptLink';
import OcptNode from '~/components/ocpt/nodes/OcptNode';
import { useOriginalRenderedOcpt, useRenderedOcpt } from '~/stores/store';
import { projectTreeOntoOT, updateTreeWithExtendedOperators } from '~/lib/ocpt/ocptProject';
import { type Node } from '~/types/ocpt/ocpt.types';

interface RenderTreeProps {
    rootNode: HierarchyNode<Node>;
    filteredObjectTypes: string[];
    setHoveredNode: React.Dispatch<React.SetStateAction<HierarchyPointNode<Node> | null>>;
    colorScale: ScaleOrdinal<string, string, never>;
    sizeWidth: number;
    sizeHeight: number;
    showDetails?: boolean;
    onOperatorClick?: (node: HierarchyPointNode<Node>) => void;
}

export const RenderTree: React.FC<RenderTreeProps> = ({
    rootNode,
    filteredObjectTypes,
    setHoveredNode,
    colorScale,
    sizeWidth,
    sizeHeight,
    showDetails,
    onOperatorClick,
}) => {
    const [links, setLinks] = useState<HierarchyPointLink<Node>[]>([]);

    const [originalRenderedTree, setOriginalRenderedTree] = useState<HierarchyPointNode<Node> | null>(null);
    const [renderedTree, setRenderedTree] = useState<HierarchyPointNode<Node> | null>(null);
    const prevRenderedTreeRef = useRef<HierarchyPointNode<Node> | null>(null);

    const { setRenderedOcpt } = useRenderedOcpt();
    const { setOriginalRenderedOcpt } = useOriginalRenderedOcpt();

    // Capture initial tree layout for restoration
    useEffect(() => {
        if (renderedTree && !originalRenderedTree) {
            const clonedTree = cloneDeep(renderedTree);
            updateTreeWithExtendedOperators(clonedTree);
            console.log(clonedTree);
            setOriginalRenderedOcpt(clonedTree);
            setOriginalRenderedTree(clonedTree);
            setRenderedOcpt(clonedTree);
        }
    }, [renderedTree, originalRenderedTree, setOriginalRenderedOcpt, setRenderedOcpt]);

    // Handle filter changes and tree modifications
    useEffect(() => {
        // In the case where originalRenderedTree has not been initialized yet
        if (!originalRenderedTree) return;

        let newTree: HierarchyPointNode<Node>;
        if (filteredObjectTypes.length > 0) {
            newTree = cloneDeep(originalRenderedTree);
            projectTreeOntoOT(newTree, filteredObjectTypes);
            console.log(newTree);
        } else {
            newTree = originalRenderedTree;
        }

        // Prevent unnecessary updates if tree structure hasn't changed
        if (prevRenderedTreeRef.current !== newTree) {
            setRenderedTree(newTree);
            setRenderedOcpt(newTree);
            prevRenderedTreeRef.current = newTree;
        }
    }, [filteredObjectTypes, originalRenderedTree, setRenderedOcpt]);

    // Update links when tree structure changes
    useEffect(() => {
        if (renderedTree) {
            setLinks(renderedTree.links());
        }
    }, [renderedTree]);

    return (
        <Tree
            root={rootNode}
            separation={(a) => {
                return 2 + a.depth * 0.7;
            }}
            size={[sizeWidth, sizeHeight]}
            nodeSize={[40, 150]}
        >
            {(tree) => {
                if (!renderedTree) {
                    setRenderedTree(tree);
                }
                const currentTree = renderedTree ? renderedTree : tree;

                return (
                    <Group top={0} left={0}>
                        {links.map((link, i) => {
                            return <OcptLink key={i} link={link} linkId={i} />;
                        })}
                        {currentTree
                            .descendants()
                            .reverse()
                            .map((node, key) => {
                                if (!node.data) return null;
                                const checkedNode = node as HierarchyPointNode<Node>;

                                return (
                                    <OcptNode
                                        node={checkedNode}
                                        key={key}
                                        setHoveredNode={setHoveredNode}
                                        colorScale={colorScale}
                                        showDetails={showDetails}
                                        onOperatorClick={onOperatorClick}
                                    />
                                );
                            })}
                    </Group>
                );
            }}
        </Tree>
    );
};
