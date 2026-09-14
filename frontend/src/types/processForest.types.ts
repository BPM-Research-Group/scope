export type ProcessForestOperator = 'sequence' | 'parallel' | 'exclusive_choice' | 'loop';

export type ProcessForestNode =
    | {
          kind: 'leaf';
          activity: string | null;
          related: string[];
          convergent: string[];
          deficient: string[];
      }
    | {
          kind: 'operator';
          operators: Record<string, ProcessForestOperator>;
          children: ProcessForestNode[];
      };

export interface ProcessForest {
    object_types: string[];
    root: ProcessForestNode;
}

export interface ProcessForestResponse {
    file_id: string;
    source_file_id?: string;
    threshold?: number;
    process_forest: ProcessForest;
}
