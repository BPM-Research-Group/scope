import { HierarchyPointNode } from '@visx/hierarchy/lib/types';
import { ScaleOrdinal } from 'd3';
import ProcessTreeOperatorNode from '~/components/ocpt/nodes/ProcessTreeOperatorNode';
import TextNode from '~/components/ocpt/nodes/TextNode';
import {
    isActivity,
    isExtendedProcessTreeOperatorNode,
    isIdentityOperatorApi,
    isProcessTreeOperator,
    isSilentActivity,
    isTrueSilentActivity,
} from '~/lib/ocpt/ocptGuards';
import { Node } from '~/types/ocpt/ocpt.types';

const parentIsArbitraryOrSkip = (parent: HierarchyPointNode<Node> | null) => {
    if (!parent) return false;

    const value = parent.data.value;
    if (isExtendedProcessTreeOperatorNode(value)) {
        return value.operator === 'arbitrary' || value.operator === 'skip';
    }
    return false;
};

interface OcptNodeProps {
    node: HierarchyPointNode<Node>;
    key: number;
    setHoveredNode: React.Dispatch<React.SetStateAction<HierarchyPointNode<Node> | null>>;
    colorScale: ScaleOrdinal<string, string, never>;
    showDetails?: boolean;
    onOperatorClick?: (node: HierarchyPointNode<Node>) => void;
}

const OcptNode: React.FC<OcptNodeProps> = ({ node, key, setHoveredNode, colorScale, showDetails, onOperatorClick }) => {
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
                showDetails={showDetails}
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
                showDetails={showDetails}
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
                onMouseEnter={() => setHoveredNode(node)}
                onMouseMove={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
            />
        );
    } else if (isExtendedProcessTreeOperatorNode(value) || isIdentityOperatorApi(value)) {
        return (
            <ProcessTreeOperatorNode
                operator={value.operator}
                height={height}
                width={width}
                node={node}
                key={key}
                opacity={opacity}
                identityKinds={value.identity?.length ? [...new Set(value.identity.map((r) => r.kind))] : undefined}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseMove={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={onOperatorClick ? () => onOperatorClick(node) : undefined}
            />
        );
    }

    console.error('Unknown node type', node);
    return null;
};

export default OcptNode;
