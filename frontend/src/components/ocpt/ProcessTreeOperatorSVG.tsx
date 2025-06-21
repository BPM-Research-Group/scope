interface ProcessTreeOperatorSVGProps {
    path: JSX.Element;
    width: number;
    height: number;
    opacity: number;
}

const ProcessTreeOperatorSVG: React.FC<ProcessTreeOperatorSVGProps> = ({ path, width, height, opacity }) => {
    return (
        <svg
            width={width}
            height={height}
            fill="none"
            opacity={opacity}
            x={-width / 2}
            y={-height / 2}
            viewBox="0 0 15 15"
            className="text-black"
        >
            {path}
        </svg>
    );
};

export default ProcessTreeOperatorSVG;
