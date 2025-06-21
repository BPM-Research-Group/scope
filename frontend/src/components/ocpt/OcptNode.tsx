import { HierarchyPointNode } from '@visx/hierarchy/lib/types';
import { ScaleOrdinal } from 'd3';
import { TreeNode } from '~/components/ocpt/ocpt.types';
import ProcessTreeOperatorNode from '~/components/ocpt/ProcessTreeOperatorNode';
import TextNode from '~/components/ocpt/TextNode';
import {
    isActivity,
    isExtendedProcessTreeOperatorNode,
    isProcessTreeOperator,
    isSilentActivity,
    isTrueSilentActivity,
} from '~/lib/ocptGuards';

const parentIsArbitraryOrSkip = (parent: HierarchyPointNode<TreeNode> | null) => {
    if (!parent) return false;

    const value = parent.data.value;
    return isExtendedProcessTreeOperatorNode(value) && (value.operator === 'arbitrary' || value.operator === 'skip');
};

interface OcptNodeProps {
    node: HierarchyPointNode<TreeNode>;
    key: number;
    setHoveredNode: React.Dispatch<React.SetStateAction<HierarchyPointNode<TreeNode> | null>>;
    colorScale: ScaleOrdinal<string, string, never>;
}

const OcptNode: React.FC<OcptNodeProps> = ({ node, key, setHoveredNode, colorScale }) => {
    const width = 50;
    const height = 50;
    const value = node.data.value;
    const opacity = parentIsArbitraryOrSkip(node.parent) ? 0.3 : 1.0;

    if (isTrueSilentActivity(value)) {
        return (
            <TextNode
                height={height}
                width={width + 50}
                node={node}
                key={key}
                isSilent={true}
                opacity={opacity}
                colorScale={colorScale}
                onMouseEnter={(_, node) => setHoveredNode(node)}
                onMouseMove={(_, node) => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
            />
        );
    } else if (isActivity(value) || (isSilentActivity(value) && value.isSilent === false)) {
        return (
            <TextNode
                height={height}
                width={width + 50}
                node={node}
                key={key}
                isSilent={false}
                opacity={opacity}
                colorScale={colorScale}
                onMouseEnter={(_, node) => setHoveredNode(node)}
                onMouseMove={(_, node) => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
            />
        );
    } else if (isProcessTreeOperator(value)) {
        return (
            <ProcessTreeOperatorNode
                operator={value}
                height={height}
                width={width}
                node={node}
                key={key}
                opacity={opacity}
            />
        );
    } else if (isExtendedProcessTreeOperatorNode(value))
        return (
            <ProcessTreeOperatorNode
                operator={value.operator}
                height={height}
                width={width}
                node={node}
                key={key}
                opacity={opacity}
                ots={value.ots}
                colorScale={colorScale}
            />
        );

    console.error('Unknown node type', node);
    return null;
};

export default OcptNode;
