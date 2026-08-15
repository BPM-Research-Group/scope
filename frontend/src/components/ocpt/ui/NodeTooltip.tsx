import { useEffect, useState } from 'react';
import { usePopper } from 'react-popper';
import LegendRect from '~/components/ocpt/ui/LegendRect';
import '~/components/ocpt/ui/NodeTooltip.css';
import { isActivity, isExtendedProcessTreeOperatorNode, isIdentityOperatorApi } from '~/lib/ocpt/ocptGuards';
import type { IdentityRelation } from '~/types/ocpt/identityOcpt.types';
import type { Activity } from '~/types/ocpt/ocpt.types';

const ActivityTooltipContent = ({ value, coloring }: { value: Activity; coloring: any }) => {
    const legendGlyphSize = 15;
    return (
        <>
            <div className="pb-1 mb-1 text-sm font-bold leading-none border-b border-gray-200 border-opacity-20">
                {value.activity}
            </div>
            <div className="grid gap-x-2" style={{ gridTemplateColumns: 'max-content 1fr' }}>
                <div className="grid gap-y-2">
                    {value.ots.map((ot, index) => (
                        <div key={index} className="grid grid-cols-2 items-center gap-x-4">
                            <div className="flex items-center">
                                <LegendRect fill={coloring(ot.ot)} size={legendGlyphSize} />
                                <span className="px-1 font-semibold rounded">{ot.ot}</span>
                            </div>
                            <div>
                                {ot.exhibits &&
                                    ot.exhibits.map((exhibit, i) => (
                                        <span className="ml-1" key={i}>
                                            {exhibit}
                                        </span>
                                    ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
};

const OtLabel = ({ ot, coloring }: { ot: string; coloring: any }) => (
    <span className="inline-flex items-center gap-0.5">
        <LegendRect fill={coloring(ot)} size={12} />
        <span className="font-medium">{ot}</span>
    </span>
);

const IdentityRelationItem = ({ relation, coloring }: { relation: IdentityRelation; coloring: any }) => {
    const kindLabel =
        relation.kind === 'sync'
            ? 'Synchronous'
            : relation.kind === 'impConcurrent'
              ? 'Implicitly Concurrent'
              : 'Temporal Implication';
    return (
        <div className="py-1">
            <div className="text-xs text-gray-400 mb-0.5">{kindLabel}</div>
            <div className="flex items-center gap-1 text-sm flex-wrap">
                {relation.left.map((ot, i) => (
                    <span key={i} className="inline-flex items-center">
                        {i > 0 && <span className="text-gray-400 mr-1">,</span>}
                        <OtLabel ot={ot} coloring={coloring} />
                    </span>
                ))}
                <span className="text-gray-400">
                    {relation.kind === 'sync' ? '=' : relation.kind === 'impConcurrent' ? '⇒‖' : '⇒→'}
                </span>
                {relation.right.map((ot, i) => (
                    <span key={i} className="inline-flex items-center">
                        {i > 0 && <span className="text-gray-400 mr-1">,</span>}
                        <OtLabel ot={ot} coloring={coloring} />
                    </span>
                ))}
            </div>
        </div>
    );
};

const OperatorTooltipContent = ({
    operator,
    identity,
    coloring,
}: {
    operator: string;
    identity: IdentityRelation[];
    coloring: any;
}) => {
    return (
        <>
            <div className="pb-1 mb-1 text-sm font-bold leading-none border-b border-gray-200 border-opacity-20">
                {operator}
            </div>
            <div className="text-xs font-semibold text-gray-400 mb-1">Identity Relations</div>
            <div className="divide-y divide-gray-700">
                {identity.map((rel, i) => (
                    <IdentityRelationItem key={i} relation={rel} coloring={coloring} />
                ))}
            </div>
        </>
    );
};

// Component for Process Forests
const ForestOperatorTooltipContent = ({ operators }: { operators: Record<string, string> }) => {
    return (
        <>
            <div className="pb-1 mb-2 text-sm font-bold leading-none border-b border-gray-200 border-opacity-20">
                Process Forest Operator
            </div>
            <div className="text-xs font-semibold text-gray-400 mb-2">Operators per Object Type</div>
            <div className="grid gap-y-1">
                {Object.entries(operators).map(([ot, op]) => (
                    <div key={ot} className="flex justify-between items-center gap-4 text-xs">
                        <span className="font-medium text-gray-200">{ot}:</span>
                        <span className="font-mono text-[10px] bg-slate-800 text-slate-200 px-1.5 py-0.5 rounded border border-slate-700">
                            {String(op)}
                        </span>
                    </div>
                ))}
            </div>
        </>
    );
};

const NodeTooltip = ({ hoverPoint, transformMatrix, coloring }: any) => {
    if (!hoverPoint) return null;

    const { scaleX, scaleY, translateX, translateY } = transformMatrix;

    const adjustedX = hoverPoint.x * scaleX + translateX;
    const adjustedY = hoverPoint.y * scaleY + translateY;

    const value = hoverPoint.data.value;

    // Check for Process Forest operator
    // If it has our mapped 'operators' dictionary, render the special list
    if (value.operators && Object.keys(value.operators).length > 0) {
        return (
            <XYPopper x={adjustedX} y={adjustedY}>
                <ForestOperatorTooltipContent operators={value.operators} />
            </XYPopper>
        );
    }

    // Activity or SilentActivity tooltip
    if (isActivity(value)) {
        return (
            <XYPopper x={adjustedX} y={adjustedY}>
                <ActivityTooltipContent value={value} coloring={coloring} />
            </XYPopper>
        );
    }

    // Operator with identity relations (post-projection with ots)
    if (isExtendedProcessTreeOperatorNode(value) && value.identity?.length) {
        return (
            <XYPopper x={adjustedX} y={adjustedY}>
                <OperatorTooltipContent operator={value.operator} identity={value.identity} coloring={coloring} />
            </XYPopper>
        );
    }

    // Operator object from API (pre-projection, no ots)
    if (isIdentityOperatorApi(value) && Array.isArray((value as any).identity) && (value as any).identity.length > 0) {
        return (
            <XYPopper x={adjustedX} y={adjustedY}>
                <OperatorTooltipContent
                    operator={value.operator}
                    identity={(value as any).identity}
                    coloring={coloring}
                />
            </XYPopper>
        );
    }

    return null;
};

// THIS IS THE EXAMPLE CODE FROM VISX

/**
 * Generic popper wrapper that places a popper at an x y position
 * Uses a dummy element to handle this. An alternative is to provide
 * the referenceElement node yourself and not use a dummy element,
 * which can be helpful for things where you interact directly like in
 * bar charts.
 *
 * FYI this requires custom css to work, see CSS code.
 */

const XYPopper = ({ x, y, children }: any) => {
    const [referenceElement, setReferenceElement] = useState<HTMLDivElement | null>(null);
    const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
    const [arrowElement, setArrowElement] = useState<HTMLDivElement | null>(null);

    const offsetX = 20;
    const offsetY = 20;

    const { styles, attributes, update } = usePopper(referenceElement, popperElement, {
        placement: 'top',
        modifiers: [
            { name: 'offset', options: { offset: [offsetX, offsetY] } },
            {
                name: 'arrow',
                options: { element: arrowElement, padding: 8 },
            },
        ],
    });
    // force the popper to update its reference element when x and y change
    // since we are using a dummy element

    useEffect(() => {
        if (x !== null && y !== null) {
            update?.();
        }
    }, [x, y, update]);

    return (
        <>
            <div /** dummy element to position popper with */
                ref={setReferenceElement}
                style={{
                    position: 'absolute',
                    left: x,
                    top: y,
                    width: 0,
                    height: 0,
                    pointerEvents: 'none',
                }}
            />
            <div ref={setPopperElement} className="xy-popper" style={styles.popper} {...attributes.popper}>
                <div ref={setArrowElement} style={styles.arrow} {...attributes.arrow} className="xy-popper-arrow" />
                <div className="xy-popper-content w-64">{children}</div>
            </div>
        </>
    );
};

export default NodeTooltip;
