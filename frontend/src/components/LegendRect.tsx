interface LegendRectProps {
    fill: string;
    size: number;
    opacity?: number;
}

const LegendRect: React.FC<LegendRectProps> = ({ fill, size, opacity }) => {
    return (
        <svg width={size} height={size}>
            <rect fill={fill} width={size} height={size} opacity={opacity} />
        </svg>
    );
};

export default LegendRect;
