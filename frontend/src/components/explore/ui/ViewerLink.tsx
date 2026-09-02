import React from 'react';
import { type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { flushPipelineDraft } from '~/lib/explore/pipelineAutosave';

interface ViewerLinkProps {
    /** Absolute viewer route, e.g. `/data/pipeline/explore/ocpt/<nodeId>`. */
    to: string;
    icon: LucideIcon;
    iconClassName?: string;
    label: string;
}

/**
 * Button that opens a viewer. Renders as a real link, so the browser's own
 * cmd/ctrl-click, middle-click and "Open link in new tab" work on it.
 *
 * A new tab seeds its flow store from the autosaved pipeline draft, so the draft
 * is flushed before the navigation happens.
 */
const ViewerLink: React.FC<ViewerLinkProps> = ({ to, icon: Icon, iconClassName, label }) => (
    <Button asChild variant="outline" size="sm" className="w-full justify-start h-7 px-2 text-xs">
        <Link to={to} onClick={flushPipelineDraft} onAuxClick={flushPipelineDraft}>
            <Icon className={`mr-2 h-3.5 w-3.5 shrink-0 ${iconClassName ?? ''}`} />
            <span className="truncate">{label}</span>
        </Link>
    </Button>
);

export default ViewerLink;
