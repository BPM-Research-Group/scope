import { memo, useState } from 'react';
import { useColorScaleStore } from '~/stores/store';

interface TokenProps {
    id: string;
    type: string;
    radius: number;
    label: string;
    title?: string;
    onMount: (element: SVGGElement) => void;
    onUnmount: () => void;
}

const Token: React.FC<TokenProps> = ({ id, type, radius, label, title, onMount, onUnmount }) => {
    const { colorScale } = useColorScaleStore();
    const [hovered, setHovered] = useState(false);

    const tokenRef = (el: SVGGElement | null) => {
        if (el) {
            onMount(el);
        } else {
            onUnmount();
        }
    };

    const tooltipWidth = title ? title.length * 6.2 + 16 : 0;
    return (
        <g
            ref={tokenRef}
            pointerEvents="all"
            style={title ? { cursor: 'pointer' } : undefined}
            onMouseEnter={title ? () => setHovered(true) : undefined}
            onMouseLeave={title ? () => setHovered(false) : undefined}
        >
            {title && <circle r={radius + 6} fill="transparent" />}
            <circle className={`token-circle token-${id}`} r={radius} fill={colorScale(type)} />
            <text textAnchor="middle" dy=".3em" fontSize="10" fill="#fff">
                {label}
            </text>
            {hovered && title && (
                <g pointerEvents="none" transform={`translate(0, ${-radius - 16})`}>
                    <rect
                        x={-tooltipWidth / 2}
                        y={-10}
                        width={tooltipWidth}
                        height={20}
                        rx={4}
                        fill="#1f2937"
                        opacity={0.92}
                    />
                    <text textAnchor="middle" dy=".3em" fontSize="10" fill="#fff">
                        {title}
                    </text>
                </g>
            )}
        </g>
    );
};

export const MemoizedToken = memo(Token);
