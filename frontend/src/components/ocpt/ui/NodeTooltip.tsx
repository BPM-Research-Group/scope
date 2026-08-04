import { useEffect, useState } from 'react';
import { usePopper } from 'react-popper';
import LegendRect from '~/components/ocpt/ui/LegendRect';
import '~/components/ocpt/ui/NodeTooltip.css';
import { isActivity } from '~/lib/ocpt/ocptGuards';
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

const NodeTooltip = ({ hoverPoint, transformMatrix, coloring }: any) => {
    if (!hoverPoint) return null;

    const { scaleX, scaleY, translateX, translateY } = transformMatrix;

    const adjustedX = hoverPoint.x * scaleX + translateX;
    const adjustedY = hoverPoint.y * scaleY + translateY;

    const value = hoverPoint.data.value;

    // Activity or SilentActivity tooltip
    if (isActivity(value)) {
        return (
            <XYPopper x={adjustedX} y={adjustedY}>
                <ActivityTooltipContent value={value} coloring={coloring} />
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
