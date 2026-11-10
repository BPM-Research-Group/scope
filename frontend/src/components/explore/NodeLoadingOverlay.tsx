
import { Loader2 } from 'lucide-react';

interface NodeLoadingOverlayProps {
    left: number;
    top: number;
    width: number;
    height: number;
    message?: string;
}

const NodeLoadingOverlay = ({
    left,
    top,
    width,
    height,
    message = 'Processing...',
}: NodeLoadingOverlayProps) => {
    return (
        <div
            className="absolute z-[1000] flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm"
            style={{
                left,
                top,
                width,
                height,
                pointerEvents: 'all',
            }}
        >
            <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <span className="text-sm font-medium text-foreground">
                    {message}
                </span>
            </div>
        </div>
    );
};

export default NodeLoadingOverlay;
