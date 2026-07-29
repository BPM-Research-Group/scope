// import { useEffect, useRef, useState } from 'react';
// import { Group } from '@visx/group';
// import { Tree } from '@visx/hierarchy';
// import { HierarchyNode, HierarchyPointLink, HierarchyPointNode } from '@visx/hierarchy/lib/types';
// import { type ScaleOrdinal } from 'd3-scale';
// import { cloneDeep } from 'lodash-es';
// import OcptLink from '~/components/ocpt/links/OcptLink';
// import OcptNode from '~/components/ocpt/nodes/OcptNode';
// import { useOriginalRenderedOcpt, useRenderedOcpt } from '~/stores/store';
// import { projectTreeOntoOT, updateTreeWithExtendedOperators } from '~/lib/ocpt/ocptProject';
// import { type ExtendedOperator, type Node, type SilentActivity } from '~/types/ocpt/ocpt.types';
// interface RenderTreeProps {
//     rootNode: HierarchyNode<Node>;
//     filteredObjectTypes: string[];
//     setHoveredNode: React.Dispatch<React.SetStateAction<HierarchyPointNode<Node> | null>>;
//     colorScale: ScaleOrdinal<string, string, never>;
//     sizeWidth: number;
//     sizeHeight: number;
//     showDetails?: boolean;
//     onOperatorClick?: (node: HierarchyPointNode<Node>) => void;
//     isForestMode?: boolean;
// }
// export const RenderTree: React.FC<RenderTreeProps> = ({
//     rootNode,
//     filteredObjectTypes,
//     setHoveredNode,
//     colorScale,
//     sizeWidth,
//     sizeHeight,
//     showDetails,
//     onOperatorClick,
//     isForestMode,
// }) => {
//     const [links, setLinks] = useState<HierarchyPointLink<Node>[]>([]);
//     const [originalRenderedTree, setOriginalRenderedTree] = useState<HierarchyPointNode<Node> | null>(null);
//     const [renderedTree, setRenderedTree] = useState<HierarchyPointNode<Node> | null>(null);
//     const prevRenderedTreeRef = useRef<HierarchyPointNode<Node> | null>(null);
//     const { setRenderedOcpt } = useRenderedOcpt();
//     const { setOriginalRenderedOcpt } = useOriginalRenderedOcpt();
//     // ==========================================
//     // 1. THE CACHE BUSTER (The Fix!)
//     // ==========================================
//     // Whenever the incoming tree data changes (e.g. toggling Forest Mode),
//     // we MUST destroy the old cached tree so it is forced to read the new data!
//     useEffect(() => {
//         setRenderedTree(null);
//         setOriginalRenderedTree(null);
//         prevRenderedTreeRef.current = null;
//     }, [rootNode]);
//     // 2. INITIAL SETUP: Capture the pure tree ONCE per dataset
//     useEffect(() => {
//         if (renderedTree && !originalRenderedTree) {
//             const pureTree = cloneDeep(renderedTree);
//             setOriginalRenderedTree(pureTree);
//             setOriginalRenderedOcpt(pureTree);
//         }
//     }, [renderedTree, originalRenderedTree, setOriginalRenderedOcpt]);
//     // 3. PROJECTION ENGINE: Dynamically rebuild the tree every time a toggle is clicked
//     useEffect(() => {
//         if (!originalRenderedTree) return;
//         // Start with a fresh, pure clone every single time
//         let newTree = cloneDeep(originalRenderedTree);
//         if (filteredObjectTypes.length > 0) {
//             if (isForestMode) {
//                 const activeOT = filteredObjectTypes[0];
//                 // FOREST MODE: Apply dynamic operator swaps
//                 newTree.each((node) => {
//                     const val = node.data.value;
//                     if (!val) return;
//                     // Swap the operator symbol based on the active object type
//                     if ('operators' in val) {
//                         const projectedOperator = val.operators[activeOT] || 'parallel';
//                         node.data.value = {
//                             operator: projectedOperator,
//                             ots: val.ots || [],
//                             identity: val.identity,
//                         } as ExtendedOperator;
//                     }
//                     // Turn unrelated activities into silent τ nodes
//                     if ('activity' in val && !('operators' in val)) {
//                         const isRelated = val.ots?.some((ot) => ot.ot === activeOT);
//                         if (!isRelated) {
//                             node.data.value = {
//                                 ...val,
//                                 activity: 'τ',
//                                 isSilent: true,
//                                 ots: [{ ot: activeOT }], // Inject active OT so the renderer doesn't crash
//                             } as SilentActivity;
//                         }
//                     }
//                 });
//                 // Apply standard layout/visual metadata AFTER our swaps are done
//                 updateTreeWithExtendedOperators(newTree);
//             } else {
//                 // NORMAL MODE: Flatten Process Forest operators to prevent legacy code from crashing
//                 newTree.each((node) => {
//                     const val = node.data.value;
//                     if (val && 'operators' in val) {
//                         const defaultOp = Object.values(val.operators)[0] || 'parallel';
//                         node.data.value = {
//                             operator: defaultOp,
//                             ots: val.ots || [],
//                             identity: val.identity,
//                         } as ExtendedOperator;
//                     }
//                 });
//                 // Run your legacy algorithms to format and prune the standard tree
//                 updateTreeWithExtendedOperators(newTree);
//                 projectTreeOntoOT(newTree, filteredObjectTypes);
//             }
//         } else {
//             newTree = originalRenderedTree;
//         }
//         if (prevRenderedTreeRef.current !== newTree) {
//             setRenderedTree(newTree);
//             setRenderedOcpt(newTree);
//             prevRenderedTreeRef.current = newTree;
//         }
//     }, [filteredObjectTypes, originalRenderedTree, setRenderedOcpt, isForestMode]);
//     useEffect(() => {
//         if (renderedTree) {
//             setLinks(renderedTree.links());
//         }
//     }, [renderedTree]);
//     return (
//         <Tree root={rootNode} separation={(a) => 2 + a.depth * 0.7} size={[sizeWidth, sizeHeight]} nodeSize={[40, 150]}>
//             {(tree) => {
//                 // Safely capture the Visx tree layout
//                 if (!renderedTree && !originalRenderedTree) {
//                     // Using Promise.resolve prevents React "update during render" warnings
//                     Promise.resolve().then(() => setRenderedTree(tree));
//                 }
//                 const currentTree = renderedTree ? renderedTree : tree;
//                 return (
//                     <Group top={0} left={0}>
//                         {links.map((link, i) => (
//                             <OcptLink key={i} link={link} linkId={i} />
//                         ))}
//                         {currentTree
//                             .descendants()
//                             .reverse()
//                             .map((node, key) => {
//                                 if (!node.data) return null;
//                                 const checkedNode = node as HierarchyPointNode<Node>;
//                                 return (
//                                     <OcptNode
//                                         node={checkedNode}
//                                         key={key}
//                                         setHoveredNode={setHoveredNode}
//                                         colorScale={colorScale}
//                                         showDetails={showDetails}
//                                         onOperatorClick={onOperatorClick}
//                                     />
//                                 );
//                             })}
//                     </Group>
//                 );
//             }}
//         </Tree>
//     );
// };
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
