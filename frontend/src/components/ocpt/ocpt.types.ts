import { HierarchyPointLink, HierarchyPointNode } from '@visx/hierarchy/lib/types';

export type ProcessTreeOperators = 'sequence' | 'parallel' | 'loop' | 'xor';
export type ExtendedProcessTreeOperatorType = ProcessTreeOperators | 'skip' | 'arbitrary';

export interface IExtendedProcessTreeOperator {
    operator: ExtendedProcessTreeOperatorType;
    ots: ObjectType[];
}

export class ExtendedProcessTreeOperator implements IExtendedProcessTreeOperator {
    operator: ExtendedProcessTreeOperatorType;
    ots: ObjectType[];

    constructor(operator: ExtendedProcessTreeOperatorType, ots: ObjectType[]) {
        this.operator = operator;
        this.ots = ots;
    }
}

export type Exhibit = 'div' | 'con' | 'def';

export interface ObjectType {
    ot: string;
    exhibits?: Exhibit[];
}

export interface IActivity {
    activity: string;
    ots: ObjectType[];
}

export interface TreeNode extends JSONTreeNode {
    id: number;
}

export interface JSONTreeNode {
    value: Activity | ProcessTreeOperators | SilentActivity | ExtendedProcessTreeOperator;
    isExpanded?: boolean;
    children?: TreeNode[];
}

export class CTreeNode implements TreeNode {
    id: number;
    value: Activity | ProcessTreeOperators | SilentActivity | ExtendedProcessTreeOperator;
    isExpanded?: boolean;
    children?: TreeNode[];

    constructor(
        id: number,
        value: Activity | ProcessTreeOperators | SilentActivity | ExtendedProcessTreeOperator,
        isExpanded?: boolean,
        children?: TreeNode[]
    ) {
        this.id = id;
        this.value = value;
        this.isExpanded = isExpanded;
        this.children = children;
    }
}

export interface JSONSchema {
    ots: string[];
    hierarchy: JSONTreeNode;
}

export interface NodeProps {
    height: number;
    width: number;
    node: HierarchyPointNode<TreeNode>;
    key: number;
}

export class Activity implements IActivity {
    activity: string;
    ots: ObjectType[];

    constructor(activity: string, ots: ObjectType[]) {
        this.activity = activity;
        this.ots = ots;
    }
}

export type FilteredObjectTypes = string[] | [];

export interface HierarchyPointLinkObjectCentric<T> extends HierarchyPointLink<T> {
    ot?: ObjectType;
}

export class SilentActivity extends Activity {
    isSilent: boolean;

    constructor(activity: string, ots: ObjectType[], isSilent: boolean) {
        super(activity, ots);

        this.isSilent = isSilent;
    }
}
