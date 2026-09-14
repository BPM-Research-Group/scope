export type Stats = {
    count: number;
    min: number;
    max: number;
    mean: number;
    median: number;
    std_dev: number;
    sum: number;
};

export type Attribute = {
    name: string;
    value_type: string;
    numeric: boolean;
};

export type AttributeStatsPrams = {
    left_attribute?: string;
    left_object_type?: string;
    left_event_type?: string;
    left_intra_case_agg?: 'sum' | 'mean' | 'min' | 'max' | 'count';
    right_attribute?: string;
    right_object_type?: string;
    right_event_type?: string;
    right_intra_case_agg?: 'sum' | 'mean' | 'min' | 'max' | 'count';
    event_type?: string;
    object_type?: string;
    attribute?: string;
    intra_case_agg?: 'sum' | 'mean' | 'min' | 'max' | 'count';
    operation?: 'add' | 'subtract' | 'multiply' | 'divide';
    histogram?: boolean;
    from_activity?: string;
    to_activity?: string;
};

export type Props = {
    fileId: string | null;
    sourceType: string;
    Id: string;
};

export interface HistogramItem {
    bin_midpoint: number;
    frequency: number;
    bin_start: number;
    bin_end: number;
}

export const COLORS = ['#2563eb', '#9333ea', '#14b8a6', '#f97316'];

export type CaseType =
    | 'case_attribute_event_type'
    | 'case_attribute_object_type'
    | 'attribute_combination'
    | 'case_duration'
    | 'activity_time';

export type IntraCaseAgg = 'sum' | 'mean' | 'min' | 'max' | 'count' | '';
