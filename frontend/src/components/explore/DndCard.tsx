import type { ElementType, DragEvent } from 'react';
import { useDnD } from '~/components/explore/DndContext';
import type { ExploreNodeType } from '~/types/explore';

interface DndCardProps {
    title: string;
    Icon: ElementType;
    nodeType: ExploreNodeType;
}

const DndCard: React.FC<DndCardProps> = ({ title, Icon, nodeType }) => {
    const [_, setType] = useDnD();

    const onDragStart = (event: DragEvent<HTMLDivElement>, nodeType: ExploreNodeType) => {
        setType(nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div
            onDragStart={(event) => onDragStart(event, nodeType)}
            draggable
            className="flex flex-col items-center w-16 h-16 rounded-lg border-[1px] border-gray-400 p-2"
        >
            <p className="text-xs font-bold text-center">{title}</p>
            <Icon />
        </div>
    );
};

export default DndCard;
