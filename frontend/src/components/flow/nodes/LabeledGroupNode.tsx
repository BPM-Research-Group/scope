import { memo } from 'react';

import { NodeProps, type Node } from '@xyflow/react';
import { GroupNode } from '~/components/ui/labeled-group-node';

type ActivityNodeProps = {
    label: string;
};

type ActivityNodeType = Node<ActivityNodeProps>;

const LabeledGroupNodeDemo = memo(({ selected, data }: NodeProps<ActivityNodeType>) => {
    return <GroupNode selected={selected} label={data.label} />;
});

export default LabeledGroupNodeDemo;
