import { useEffect, useState } from 'react';
import { History, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { PipelineDraft } from '~/lib/explore/pipelineDraft';

// Kept outside the component so the prompt does not come back every time the
// user navigates between the canvas and a viewer within the same tab.
let dismissedThisSession = false;

const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

/**
 * Puts the autosaved pipeline back on the canvas when it comes up empty — after
 * a reload, or after coming back from the home screen — and says so. Nothing is
 * destroyed either way: the draft stays available on the pipeline overview.
 */
export const RestoreDraftPanel = () => {
    const navigate = useNavigate();
    const [restoredDraft, setRestoredDraft] = useState<PipelineDraft | null>(null);

    useEffect(() => {
        if (dismissedThisSession) return;

        const store = useExploreFlowStore.getState();
        // Never overwrite a canvas the user is already working on.
        if (store.nodes.length > 0) return;

        const draft = store.getPipelineDraft();
        if (!draft || draft.nodes.length === 0) return;

        store.restorePipelineDraft();

        // A pipeline that is still identical to its saved version just comes
        // back silently — there is no unsaved progress to ask about.
        if (!draft.isSaved) setRestoredDraft(draft);
    }, []);

    if (!restoredDraft) return null;

    const handleContinue = () => {
        dismissedThisSession = true;
        setRestoredDraft(null);
    };

    const handleGoBack = () => {
        dismissedThisSession = true;
        navigate('/data/pipeline');
    };

    return (
        <div className="absolute top-4 left-14 z-50 w-72 bg-white/95 backdrop-blur shadow-md border rounded-lg p-4 transition-all duration-300 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-blue-500" />
                    <h3 className="font-semibold text-sm text-gray-900">We restored your last progress</h3>
                </div>
                <button
                    onClick={handleContinue}
                    aria-label="Dismiss"
                    className="text-gray-400 hover:text-gray-600 -mt-1 -mr-1 p-1"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            </div>

            <p className="text-xs text-gray-500 mb-3">
                {restoredDraft.pipelineName ? `"${restoredDraft.pipelineName}" — ` : ''}
                {restoredDraft.nodes.length} node{restoredDraft.nodes.length !== 1 && 's'}, last edited{' '}
                {formatDate(restoredDraft.savedAt)}.
            </p>

            <div className="flex gap-2">
                <Button size="sm" className="flex-1 h-8 text-xs bg-blue-500 hover:bg-blue-600" onClick={handleContinue}>
                    Continue Working
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={handleGoBack}>
                    Go Back
                </Button>
            </div>
        </div>
    );
};
