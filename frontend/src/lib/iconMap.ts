import { Activity, Database, FileJson, FileSpreadsheet, FileText, Network, TreePine, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const iconMap: Record<string, LucideIcon> = {
    database: Database,
    fileText: FileText,
    workflow: Workflow,
    activity: Activity,
    fileSpreadsheet: FileSpreadsheet,
    fileJson: FileJson,
    treePine: TreePine,
    network: Network,
};

export const getIconComponent = (iconName: string): LucideIcon => {
    return iconMap[iconName] || FileText; // Default to FileText if icon not found
};
