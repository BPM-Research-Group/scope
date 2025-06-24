import { Group } from '@visx/group';
import { ScaleOrdinal } from 'd3';
import { type Activity, type NodeProps } from '~/types/ocpt/ocpt.types';
import LegendRect from '~/components/LegendRect';

import { useEffect, useRef, useState } from 'react';

interface TextNodeProps extends NodeProps {
    colorScale: ScaleOrdinal<string, string, never>;
    isSilent: boolean;
    opacity: number;
    onMouseEnter?: (event: React.MouseEvent, node: any) => void;
    onMouseMove?: (event: React.MouseEvent, node: any) => void;
    onMouseLeave?: (event: React.MouseEvent, node: any) => void;
}

const getFillColor = (isSilent: boolean) => {
    if (isSilent) {
        return 'black';
    } else return 'white';
};

const TextNode: React.FC<TextNodeProps> = ({
    height,
    width,
    node,
    key,
    colorScale,
    isSilent,
    opacity,
    onMouseEnter,
    onMouseMove,
    onMouseLeave,
}) => {
    const activity = node.data.value as Activity;
    const fillColor = getFillColor(isSilent);
    const textContent = activity.activity;

    // Create a ref to measure text width
    const textRef = useRef<SVGTextElement>(null);
    const [textWidth, setTextWidth] = useState(0);
    const [nodeWidth, setNodeWidth] = useState(width);

    // Measure text after render
    useEffect(() => {
        if (textRef.current) {
            const bbox = textRef.current.getBBox();
            setTextWidth(bbox.width);
            // Set node width based on text width with some padding
            setNodeWidth(Math.max(bbox.width + 20, width));
        }
    }, [textContent, width]);

    return (
        <Group
            top={node.y}
            left={node.x}
            key={key}
            className="cursor-pointer"
            onMouseEnter={(event) => onMouseEnter?.(event, node)}
            onMouseMove={(event) => onMouseMove?.(event, node)}
            onMouseLeave={(event) => onMouseLeave?.(event, node)}
        >
            <rect
                height={height}
                width={nodeWidth}
                y={-height / 2}
                x={-nodeWidth / 2}
                fill={fillColor}
                opacity={opacity}
                stroke="black"
                strokeWidth={2}
                rx={5}
            />
            <text
                ref={textRef}
                dy=".33em"
                textAnchor="middle"
                className={`text-black pointer-events-none`}
                opacity={opacity}
            >
                {textContent}
            </text>
            {!isSilent && (
                <foreignObject
                    x={-nodeWidth / 2}
                    y={-height / 2 + 20}
                    width={nodeWidth}
                    height={height - 20}
                    className="flex flex-col items-center justify-center"
                >
                    <div className={`mt-4 flex justify-around w-full`}>
                        {activity.ots.map((ot, index) => (
                            <LegendRect key={index} fill={colorScale(ot.ot)} size={10} opacity={opacity} />
                        ))}
                    </div>
                </foreignObject>
            )}
        </Group>
    );
};

export default TextNode;
