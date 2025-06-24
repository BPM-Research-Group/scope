import { Group } from '@visx/group';
import ProcessTreeOperatorSVG from './ProcessTreeOperatorSVG';
import { NodeProps, type ExtendedProcessTreeOperatorType, type ObjectType } from '~/types/ocpt/ocpt.types';
import { Circle } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ScaleOrdinal } from 'd3-scale';

interface ProcessTreeNodeProps extends NodeProps {
    operator: ExtendedProcessTreeOperatorType;
    key: number;
    opacity: number;
    ots?: ObjectType[];
    colorScale?: ScaleOrdinal<string, string, never>;
}

const ProcessTreeOperatorNode: React.FC<ProcessTreeNodeProps> = ({
    height,
    width,
    node,
    key,
    operator,
    opacity,
    ots,
    colorScale,
}) => {
    const [flowers, setFlowers] = useState<{ x: number; y: number; color: string }[]>([]);

    const radius = Math.min(width, height) / 2;

    useEffect(() => {
        console.log(node);
        if (!ots || ots.length === 0 || !colorScale) return;

        const divergingOts = ots.filter((ot) => ot.exhibits && ot.exhibits.includes('div')).map((ot) => ot.ot);

        const totalFlowers = divergingOts.length;
        const angleStep = 360 / totalFlowers; // Equal spacing around the circle

        const flowers = divergingOts.map((divOt, i) => {
            const angle = i * angleStep;
            return {
                x: radius * Math.cos((angle * Math.PI) / 180) - 10,
                y: radius * Math.sin((angle * Math.PI) / 180) - 10,
                color: colorScale(divOt),
            };
        });

        setFlowers(flowers);
    }, [ots]);

    return (
        <Group top={node.y} left={node.x} key={key}>
            <rect
                height={height}
                width={width}
                y={-height / 2}
                x={-width / 2}
                fill="white"
                className="stroke-black"
                strokeWidth={3}
                rx={25}
                ry={25}
                opacity={opacity}
            />
            {/* {flowers.map((flower, index) => (
                <Flower
                    key={`flower-${key}-${index}`} // Unique key for each flower
                    x={flower.x}
                    y={flower.y}
                    size={20}
                    className={` stroke-black`}
                    opacity={opacity}
                    fill={flower.color}
                />
            ))} */}
            {(() => {
                switch (operator) {
                    case 'sequence':
                        return (
                            <ProcessTreeOperatorSVG
                                width={width}
                                height={height}
                                path={
                                    <path
                                        transform="scale(0.8) translate(1.5, 1.5)"
                                        d="M8.14645 3.14645C8.34171 2.95118 8.65829 2.95118 8.85355 3.14645L12.8536 7.14645C13.0488 7.34171 13.0488 7.65829 12.8536 7.85355L8.85355 11.8536C8.65829 12.0488 8.34171 12.0488 8.14645 11.8536C7.95118 11.6583 7.95118 11.3417 8.14645 11.1464L11.2929 8H2.5C2.22386 8 2 7.77614 2 7.5C2 7.22386 2.22386 7 2.5 7H11.2929L8.14645 3.85355C7.95118 3.65829 7.95118 3.34171 8.14645 3.14645Z"
                                        fill="currentColor"
                                        fill-rule="evenodd"
                                        clip-rule="evenodd"
                                    />
                                }
                                opacity={opacity}
                            />
                        );
                    case 'parallel':
                        return (
                            <ProcessTreeOperatorSVG
                                width={width}
                                height={height}
                                path={
                                    <path
                                        transform="scale(0.8) translate(1.5, 1.5)"
                                        d="M6.04995 2.74998C6.04995 2.44623 5.80371 2.19998 5.49995 2.19998C5.19619 2.19998 4.94995 2.44623 4.94995 2.74998V12.25C4.94995 12.5537 5.19619 12.8 5.49995 12.8C5.80371 12.8 6.04995 12.5537 6.04995 12.25V2.74998ZM10.05 2.74998C10.05 2.44623 9.80371 2.19998 9.49995 2.19998C9.19619 2.19998 8.94995 2.44623 8.94995 2.74998V12.25C8.94995 12.5537 9.19619 12.8 9.49995 12.8C9.80371 12.8 10.05 12.5537 10.05 12.25V2.74998Z"
                                        fill="currentColor"
                                        fill-rule="evenodd"
                                        clip-rule="evenodd"
                                    />
                                }
                                opacity={opacity}
                            />
                        );
                    case 'loop':
                        return (
                            <ProcessTreeOperatorSVG
                                width={width}
                                height={height}
                                path={
                                    <path
                                        transform="scale(0.8) translate(1.5, 1.5)"
                                        d="M1.84998 7.49998C1.84998 4.66458 4.05979 1.84998 7.49998 1.84998C10.2783 1.84998 11.6515 3.9064 12.2367 5H10.5C10.2239 5 10 5.22386 10 5.5C10 5.77614 10.2239 6 10.5 6H13.5C13.7761 6 14 5.77614 14 5.5V2.5C14 2.22386 13.7761 2 13.5 2C13.2239 2 13 2.22386 13 2.5V4.31318C12.2955 3.07126 10.6659 0.849976 7.49998 0.849976C3.43716 0.849976 0.849976 4.18537 0.849976 7.49998C0.849976 10.8146 3.43716 14.15 7.49998 14.15C9.44382 14.15 11.0622 13.3808 12.2145 12.2084C12.8315 11.5806 13.3133 10.839 13.6418 10.0407C13.7469 9.78536 13.6251 9.49315 13.3698 9.38806C13.1144 9.28296 12.8222 9.40478 12.7171 9.66014C12.4363 10.3425 12.0251 10.9745 11.5013 11.5074C10.5295 12.4963 9.16504 13.15 7.49998 13.15C4.05979 13.15 1.84998 10.3354 1.84998 7.49998Z"
                                        fill="currentColor"
                                        fill-rule="evenodd"
                                        clip-rule="evenodd"
                                    />
                                }
                                opacity={opacity}
                            />
                        );
                    case 'xor':
                        return (
                            <ProcessTreeOperatorSVG
                                width={width}
                                height={height}
                                path={
                                    <path
                                        transform="scale(0.8) translate(1.5, 1.5)"
                                        d="M12.8536 2.85355C13.0488 2.65829 13.0488 2.34171 12.8536 2.14645C12.6583 1.95118 12.3417 1.95118 12.1464 2.14645L7.5 6.79289L2.85355 2.14645C2.65829 1.95118 2.34171 1.95118 2.14645 2.14645C1.95118 2.34171 1.95118 2.65829 2.14645 2.85355L6.79289 7.5L2.14645 12.1464C1.95118 12.3417 1.95118 12.6583 2.14645 12.8536C2.34171 13.0488 2.65829 13.0488 2.85355 12.8536L7.5 8.20711L12.1464 12.8536C12.3417 13.0488 12.6583 13.0488 12.8536 12.8536C13.0488 12.6583 13.0488 12.3417 12.8536 12.1464L8.20711 7.5L12.8536 2.85355Z"
                                        fill="currentColor"
                                    />
                                }
                                opacity={opacity}
                            />
                        );
                    case 'arbitrary':
                        return (
                            <ProcessTreeOperatorSVG
                                width={width}
                                height={height}
                                path={
                                    <path
                                        transform="scale(0.55) translate(1.5, 1.5)"
                                        fill="currentColor"
                                        d="M19.68,6.88a4.4,4.4,0,0,0-3.31-.32,4.37,4.37,0,0,0-8.73,0,4.48,4.48,0,0,0-3.31.29,4.37,4.37,0,0,0,.61,8,4.4,4.4,0,0,0-.8,2.5,5,5,0,0,0,.07.75A4.34,4.34,0,0,0,8.5,21.73a4.68,4.68,0,0,0,.64,0A4.42,4.42,0,0,0,12,20a4.42,4.42,0,0,0,2.86,1.69,4.68,4.68,0,0,0,.64,0,4.36,4.36,0,0,0,3.56-6.87,4.36,4.36,0,0,0,.62-8ZM10.34,4.94a2.4,2.4,0,0,1,3.32,0,2.43,2.43,0,0,1,.52,2.66l-.26.59-.66.58A4.07,4.07,0,0,0,12,8.55a4,4,0,0,0-1.61.34L9.83,7.6A2.39,2.39,0,0,1,10.34,4.94Zm-6.1,6.84A2.37,2.37,0,0,1,7.94,9l.49.43.35.8A3.92,3.92,0,0,0,8,12.55,2.85,2.85,0,0,0,8,13l-.55,0h0l-.84.08A2.37,2.37,0,0,1,4.24,11.78Zm6.6,6.08a2.38,2.38,0,0,1-4.66-.08,3.07,3.07,0,0,1,0-.42,2.33,2.33,0,0,1,1.17-2L7.86,15l.91-.1a4,4,0,0,0,2.38,1.57ZM12,14.55a2,2,0,1,1,2-2A2,2,0,0,1,12,14.55Zm5.82,3.22a2.36,2.36,0,0,1-2.68,1.94,2.39,2.39,0,0,1-2-1.85l-.14-.6.21-.92a4,4,0,0,0,2.2-1.76l.5.3.09,0,.66.39A2.38,2.38,0,0,1,17.82,17.77Zm1.94-6a2.39,2.39,0,0,1-2.13,1.33h-.24L16.75,13,16,12.59v0a4,4,0,0,0-1-2.64l.43-.37,0,0L16.06,9a2.37,2.37,0,0,1,3.7,2.82Z"
                                    />
                                }
                                opacity={opacity}
                            />
                        );

                    case 'skip':
                        return <Circle size={30} x={-15} y={-15} className={`opacity-[${opacity}]`} />;
                }
            })()}
        </Group>
    );
};

export default ProcessTreeOperatorNode;
