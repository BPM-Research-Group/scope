import { HierarchyPointLink, HierarchyPointNode } from '@visx/hierarchy/lib/types';
import getLinkComponent from '~/components/getLinkComponent';
import { HierarchyPointLinkObjectCentric, TreeNode } from '~/components/ocpt/ocpt.types';
import { isActivity } from '~/lib/ocptGuards';

export const LinkLine = getLinkComponent({
    layout: 'cartesian',
    linkType: 'line',
    orientation: 'vertical',
});

export const LinkDiagonal = getLinkComponent({
    layout: 'cartesian',
    linkType: 'diagonal',
    orientation: 'vertical',
});

interface GetSnappedBoundaryPointProps {
    source: {
        x: number;
        y: number;
    };
    interpolatedTarget: {
        x: number;
        y: number;
    };
    nodeCenter: {
        x: number;
        y: number;
    };
    nodeWidth: number;
    nodeHeight: number;
}
export const getSnappedBoundaryPoint = ({
    source,
    interpolatedTarget,
    nodeCenter,
    nodeWidth,
    nodeHeight,
}: GetSnappedBoundaryPointProps) => {
    const halfWidth = nodeWidth / 2;
    const halfHeight = nodeHeight / 2;

    const topBoundaryY = nodeCenter.y - halfHeight;
    const bottomBoundaryY = nodeCenter.y + halfHeight;
    const leftBoundaryX = nodeCenter.x - halfWidth;
    const rightBoundaryX = nodeCenter.x + halfWidth;

    let possibleBoundaries = [];

    if (interpolatedTarget.x > source.x && interpolatedTarget.y > source.y) {
        possibleBoundaries = ['left', 'top'];
    } else if (interpolatedTarget.x < source.x && interpolatedTarget.y > source.y) {
        possibleBoundaries = ['right', 'top'];
    } else {
        possibleBoundaries = ['top', 'left', 'right'];
    }

    let closestBoundary = possibleBoundaries[0] || 'top';
    let minDistance = Infinity;
    let snappedPoint = { ...interpolatedTarget };

    possibleBoundaries.forEach((boundary) => {
        let distance;
        if (boundary === 'top') {
            distance = Math.abs(interpolatedTarget.y - topBoundaryY);
        } else if (boundary === 'left') {
            distance = Math.abs(interpolatedTarget.x - leftBoundaryX);
        } else if (boundary === 'right') {
            distance = Math.abs(interpolatedTarget.x - rightBoundaryX);
        } else if (boundary === 'bottom') {
            distance = Math.abs(interpolatedTarget.y - bottomBoundaryY);
        } else {
            distance = 0;
        }

        if (distance < minDistance) {
            minDistance = distance;
            closestBoundary = boundary;
        }
    });

    if (closestBoundary === 'top') {
        snappedPoint.y = topBoundaryY;
    } else if (closestBoundary === 'bottom') {
        snappedPoint.y = bottomBoundaryY;
    } else if (closestBoundary === 'left') {
        snappedPoint.x = leftBoundaryX;
    } else if (closestBoundary === 'right') {
        snappedPoint.x = rightBoundaryX;
    }

    return snappedPoint;
};

interface createOtLinksParams {
    renderedTree: HierarchyPointNode<TreeNode>;
}

export const createOtLinks = ({ renderedTree }: createOtLinksParams): HierarchyPointLinkObjectCentric<TreeNode>[] => {
    const initialLinks = renderedTree.links();
    const modifiedLinks: HierarchyPointLinkObjectCentric<TreeNode>[] = [];
    initialLinks.flatMap((link, i) => {
        const targetNode = link.target;

        if (!isActivity(targetNode.data.value) || targetNode.data.value.ots.length === 0) {
            // For links without OTS, no offset needed, use original source and target
            modifiedLinks.push(link);
            return;
        }

        const activityNode = targetNode.data.value;

        return activityNode.ots.map((ot, j) => {
            const numberOfOts = activityNode.ots.length;
            const verticalSpacing = 12;
            const verticalOffset = (j - (numberOfOts - 1) / 2) * verticalSpacing;
            const horizontalOffset = 0;

            const sourcePoint = {
                x: link.source.x + horizontalOffset,
                y: link.source.y + verticalOffset,
            };
            const targetPoint = {
                x: link.target.x,
                y: link.target.y,
            };

            // Get Node Dimensions
            const nodeWidth = 100;
            const nodeHeight = 50;

            // Define target points
            const topMiddleTargetPoint = {
                x: targetPoint.x,
                y: targetPoint.y - nodeHeight / 2,
            };
            const rightMiddleTargetPoint = {
                x: targetPoint.x + nodeWidth / 2,
                y: targetPoint.y,
            };
            const leftMiddleTargetPoint = {
                x: targetPoint.x - nodeWidth / 2,
                y: targetPoint.y,
            };

            let interpolatedTargetPoint;

            // Determine relative position and choose distribution
            if (link.target.x < link.source.x && link.target.y > link.source.y) {
                // Bottom-Left: Distribute from top-middle to right-middle
                if (numberOfOts <= 1) {
                    interpolatedTargetPoint = topMiddleTargetPoint;
                } else {
                    const fraction = j / (numberOfOts - 1);
                    interpolatedTargetPoint = {
                        x: topMiddleTargetPoint.x + fraction * (rightMiddleTargetPoint.x - topMiddleTargetPoint.x),
                        y: topMiddleTargetPoint.y + fraction * (rightMiddleTargetPoint.y - topMiddleTargetPoint.y),
                    };
                }
            } else if (link.target.x > link.source.x && link.target.y > link.source.y) {
                // Bottom-Right: Distribute from TOP-MIDDLE to LEFT-MIDDLE
                if (numberOfOts <= 1) {
                    interpolatedTargetPoint = topMiddleTargetPoint;
                } else {
                    const fraction = j / (numberOfOts - 1);
                    interpolatedTargetPoint = {
                        x: topMiddleTargetPoint.x + fraction * (leftMiddleTargetPoint.x - topMiddleTargetPoint.x),
                        y: topMiddleTargetPoint.y + fraction * (leftMiddleTargetPoint.y - topMiddleTargetPoint.y),
                    };
                }
            } else {
                // Default case: Connect to top-middle
                interpolatedTargetPoint = topMiddleTargetPoint;
            }

            // Boundary Snapping for ALL cases
            const snappedTargetPoint = getSnappedBoundaryPoint({
                source: sourcePoint,
                interpolatedTarget: interpolatedTargetPoint,
                nodeCenter: targetPoint,
                nodeWidth,
                nodeHeight,
            });

            const otLink: HierarchyPointLinkObjectCentric<TreeNode> = {
                ...link,
                source: { ...link.source, x: sourcePoint.x, y: sourcePoint.y },
                target: { ...link.target, x: snappedTargetPoint.x, y: snappedTargetPoint.y },
                ot: ot,
            };

            modifiedLinks.push(otLink);
        });
    });
    return modifiedLinks;
};
