import { memo } from 'react';
import { useColorScaleStore } from '~/stores/store';

interface TokenProps {
    id: string;
    type: string;
    radius: number;
    onMount: (element: SVGGElement) => void;
    onUnmount: () => void;
}

const Token: React.FC<TokenProps> = ({ id, type, radius, onMount, onUnmount }) => {
    const { colorScale } = useColorScaleStore();

    const tokenRef = (el: SVGGElement | null) => {
        if (el) {
            onMount(el);
        } else {
            onUnmount();
        }
    };

    return (
        <g ref={tokenRef}>
            <circle
                className={`token-circle token-${id}`}
                r={radius}
                fill={colorScale(type.charAt(0).toUpperCase() + type.slice(1))}
            />
            <text textAnchor="middle" dy=".3em" fontSize="10" fill="#fff">
                {id}
            </text>
        </g>
    );
};

export const MemoizedToken = memo(Token);
