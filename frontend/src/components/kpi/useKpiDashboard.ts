import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useCaseStats, useKpiHistogramFilter, useMineKpi } from '~/services/queries';
import { createNode } from '~/lib/explore/createNode';
import { handleConnect } from '~/lib/explore/flowActions';
import type { AttributeStatsPrams, HistogramItem, Stats } from './types';

export function useKpiDashboard(fileId: string | null, Id: string) {
    const [selectedLeftObjectType, setSelectedLeftObjectType] = useState('');
    const [selectedRightObjectType, setSelectedRightObjectType] = useState('');
    const [selectedLeftEventType, setSelectedLeftEventType] = useState('');
    const [selectedRightEventType, setSelectedRightEventType] = useState('');
    const [selectedEventType, setSelectedEventType] = useState('');
    const [selectedObjectType, setSelectedObjectType] = useState('');
    const [selectedObjectTypeActivity, setSelectedObjectTypeActivity] = useState('');
    const [selectedLeftAttribute, setSelectedLeftAttribute] = useState('');
    const [selectedRightAttribute, setSelectedRightAttribute] = useState('');
    const [selectedObjectAttribute, setSelectedObjectAttribute] = useState('');
    const [selectedEventAttribute, setSelectedEventAttribute] = useState('');
    const [selectedOperation, setSelectedOperation] = useState<'add' | 'subtract' | 'multiply' | 'divide' | ''>(
        'add'
    );
    const [currentCnFileId, setCurrentCnFileId] = useState<string>('');
    const [selectedHistogramOption, setSelectedHistogramOption] = useState<boolean>(true);
    const [showHistogram, setShowHistogram] = useState<boolean>(false);
    const [histogramData, setHistogramData] = useState<HistogramItem[]>([]);
    const [selectedBins, setSelectedBins] = useState<number[]>([]);
    const [isApplyingFilter, setIsApplyingFilter] = useState(false);
    const [isMiningKPI, setIsMiningKPI] = useState(false);
    const [activityHistogramData, setActivityHistogramData] = useState<HistogramItem[]>([]);
    const [showActivityHistogram, setShowActivityHistogram] = useState(false);
    const [selectedActivityBins, setSelectedActivityBins] = useState<number[]>([]);
    const [selectedCaseType, setSelectedCaseType] = useState('case_attribute_object_type');
    const [hasUnminedChanges, setHasUnminedChanges] = useState(false);
    const [shouldFetchStats, setShouldFetchStats] = useState(false);
    const { data: metadata, isLoading: metadataLoading, error: metadataError } = useMineKpi(fileId);
    const [fromActivity, setFromActivity] = useState('');
    const [toActivity, setToActivity] = useState('');
    const [successors, setSuccessors] = useState<Record<string, string[]>>({});
    const [leftIntraCaseAgg, setLeftIntraCaseAgg] = useState<'sum' | 'mean' | 'min' | 'max' | 'count' | ''>('');
    const [rightIntraCaseAgg, setRightIntraCaseAgg] = useState<'sum' | 'mean' | 'min' | 'max' | 'count' | ''>('');
    const [intraCaseAgg, setIntraCaseAgg] = useState<'sum' | 'mean' | 'min' | 'max' | 'count' | ''>('sum');
    const [showStatsChart, setShowStatsChart] = useState(false);
    const { id: nodeId } = useParams();
    const [filteredCaseFileId, setFilteredCaseFileId] = useState<string | null>(null);
    const navigate = useNavigate();
    const { addNode, updateNodeData, getNode } = useExploreFlowStore();
    const [kpiFilterPayload, setKpiFilterPayload] = useState<any>(null);
    const [aggregation, setAggregation] = useState<keyof Stats>('mean');

    const activityBins = useMemo(
        () =>
            activityHistogramData.map((item) => ({
                x: item.bin_midpoint,
                y: item.frequency,
                bin_start: item.bin_start,
                bin_end: item.bin_end,
            })),
        [activityHistogramData]
    );

    const hasActivityHistogram = activityHistogramData.length > 0;

    useEffect(() => {
        if (activityBins.length > 0) {
            setSelectedActivityBins(activityBins.map((_, index) => index));
        }
    }, [activityBins]);

    const applyHistogramFilter = async () => {
        if (selectedBins.length === 0) return;

        let histogramFilter: any;

        if (selectedCaseType === 'attribute_combination') {
            histogramFilter = {
                type: 'attribute_combination',
                left_attribute: selectedLeftAttribute,
                left_object_type: selectedLeftObjectType,
                left_intra_case_agg: leftIntraCaseAgg,
                right_attribute: selectedRightAttribute,
                right_object_type: selectedRightObjectType,
                right_intra_case_agg: rightIntraCaseAgg,
                operation: selectedOperation,
            };
        } else if (selectedCaseType === 'case_attribute_event_type') {
            histogramFilter = {
                type: 'case_attribute',
                event_type: selectedEventType,
                attribute: selectedEventAttribute,
                intra_case_agg: intraCaseAgg,
            };
        } else if (selectedCaseType === 'case_attribute_object_type') {
            histogramFilter = {
                type: 'case_attribute',
                object_type: selectedObjectType,
                attribute: selectedObjectAttribute,
                intra_case_agg: intraCaseAgg,
            };
        } else if (selectedCaseType === 'case_duration') {
            histogramFilter = {
                type: 'case_duration',
            };
        } else if (selectedCaseType === 'activity_time') {
            histogramFilter = {
                type: 'case_time_stats',
                object_type: selectedObjectTypeActivity,
                from_activity: fromActivity,
                to_activity: toActivity,
                intra_case_agg: intraCaseAgg,
            };
        } else {
            return;
        }

        const valueRanges = selectedBins.map((index) => [bins[index].bin_start, bins[index].bin_end]);

        const payload = {
            kpi_filter: histogramFilter,
            value_ranges: valueRanges,
        };
        setKpiFilterPayload(payload);
    };

    const { data: filteredData, isLoading: IsApplyingFilter } = useKpiHistogramFilter(fileId, kpiFilterPayload, {
        enabled: Boolean(fileId && kpiFilterPayload),
    });

    useEffect(() => {
        if (filteredData) {
            setFilteredCaseFileId(filteredData);
            setIsApplyingFilter(false);
            setHasUnminedChanges(false);
        }
    }, [filteredData]);

    const handleExportNode = () => {
        if (!filteredCaseFileId || !Id) return;

        const sourceNode = getNode(Id);

        if (!sourceNode) return;

        const newNode = createNode(
            {
                x: sourceNode.position.x + 420,
                y: sourceNode.position.y,
            },
            'ocelCollectionNode',
            true
        );

        newNode.data.assets = [
            {
                id: filteredCaseFileId,
                io: 'output',
                origin: 'mined',
                type: 'ocelCollectionFile',
                name: 'Filtered Case OCEL',
            },
        ];

        addNode(newNode);

        handleConnect({
            source: Id,
            target: newNode.id,
            sourceHandle: 'source',
            targetHandle: 'target',
        });

        navigate('/data/pipeline/explore');
    };

    const formatDuration = (seconds: number) => {
        const days = seconds / 86400;

        if (days >= 1) return `${days.toFixed(2)} d`;

        const hours = seconds / 3600;

        if (hours >= 1) return `${hours.toFixed(2)} h`;

        const minutes = seconds / 60;

        return `${minutes.toFixed(2)} min`;
    };

    const loadActivitySuccessors = async (fileId: string, objectType: string) => {
        const res = await axios.get(`http://localhost:3000/v1/kpi/activity_successors/${fileId}`, {
            params: {
                object_type: objectType,
            },
        });

        setSuccessors(res.data.successors ?? {});
    };

    const handleMine = () => {
        setHasUnminedChanges(false);
        setShouldFetchStats(true);
    };

    useEffect(() => {
        setToActivity('');
    }, [fromActivity]);

    const fromActivityOptions = useMemo(() => {
        return Object.keys(successors);
    }, [successors]);

    const toActivityOptions = useMemo(() => {
        if (!fromActivity) return [];

        return successors[fromActivity] ?? [];
    }, [successors, fromActivity]);

    const params: AttributeStatsPrams | null = useMemo(() => {
        return {
            histogram: selectedHistogramOption,
            ...(selectedEventType && { event_type: selectedEventType }),
            ...(selectedObjectType && { object_type: selectedObjectType }),
            ...(selectedEventAttribute && { attribute: selectedEventAttribute }),
            ...(selectedObjectAttribute && { attribute: selectedObjectAttribute }),
            ...(selectedLeftAttribute && { left_attribute: selectedLeftAttribute }),
            ...(selectedRightAttribute && { right_attribute: selectedRightAttribute }),
            ...(selectedOperation && { operation: selectedOperation }),
            ...(intraCaseAgg && { intra_case_agg: intraCaseAgg }),
            ...(selectedLeftObjectType && { left_object_type: selectedLeftObjectType }),
            ...(selectedLeftEventType && { left_event_type: selectedLeftEventType }),
            ...(leftIntraCaseAgg && { left_intra_case_agg: leftIntraCaseAgg }),
            ...(selectedRightObjectType && { right_object_type: selectedRightObjectType }),
            ...(selectedRightEventType && { right_event_type: selectedRightEventType }),
            ...(rightIntraCaseAgg && { right_intra_case_agg: rightIntraCaseAgg }),
            ...(selectedCaseType === 'activity_time' &&
                selectedObjectTypeActivity && { object_type: selectedObjectTypeActivity }),
            ...(fromActivity && { from_activity: fromActivity }),
            ...(toActivity && { to_activity: toActivity }),
        };
    }, [
        selectedEventType,
        selectedObjectType,
        selectedEventAttribute,
        selectedObjectAttribute,
        intraCaseAgg,
        selectedLeftAttribute,
        selectedRightAttribute,
        selectedLeftObjectType,
        selectedRightObjectType,
        selectedLeftEventType,
        selectedRightEventType,
        leftIntraCaseAgg,
        rightIntraCaseAgg,
        selectedOperation,
        selectedHistogramOption,
        fromActivity,
        toActivity,
        selectedObjectTypeActivity,
    ]);

    // Kept for parity with the original implementation (currently unused downstream).
    const histogramFilter = useMemo(
        () => ({
            type: 'attribute_combination',
            left_attribute: selectedLeftAttribute,
            left_object_type: selectedLeftObjectType,
            left_intra_case_agg: leftIntraCaseAgg,
            right_attribute: selectedRightAttribute,
            right_object_type: selectedRightObjectType,
            right_intra_case_agg: rightIntraCaseAgg,
            operation: selectedOperation,
        }),
        [
            selectedLeftAttribute,
            selectedLeftObjectType,
            leftIntraCaseAgg,
            selectedRightAttribute,
            selectedRightObjectType,
            rightIntraCaseAgg,
            selectedOperation,
        ]
    );

    const {
        data: attributeStatsData,
        isLoading: attributeStatsLoading,
        error: attributeStatsError,
    } = useCaseStats(fileId, params, selectedCaseType, {
        enabled: shouldFetchStats && !!fileId,
    });

    const stats: Stats | null = attributeStatsData?.stats ?? null;

    const histData = attributeStatsData?.histogram ?? null;

    useEffect(() => {
        if (histData) {
            setHistogramData(histData);
        }
    }, [histData]);

    const bins = useMemo(
        () =>
            histogramData.map((item) => ({
                x: item.bin_midpoint,
                y: item.frequency,
                bin_start: item.bin_start,
                bin_end: item.bin_end,
            })),
        [histogramData]
    );

    const hasHistogram = histogramData.length > 0;

    const statsChartData = useMemo(() => {
        if (!stats) return [];

        return [
            { metric: 'Min', value: stats.min },
            { metric: 'Median', value: stats.median },
            { metric: 'Mean', value: stats.mean },
            { metric: 'Std Dev', value: stats.std_dev },
            { metric: 'Max', value: stats.max },
        ];
    }, [stats]);

    const histogramChartData = useMemo(() => {
        return (
            histogramData?.map((item: any) => ({
                label: Number(item.count).toFixed(2),
                frequency: item.frequency,
            })) ?? []
        );
    }, [histogramData]);

    useEffect(() => {
        if (bins.length > 0) {
            setSelectedBins(bins.map((_, index) => index));
        }
    }, [bins]);

    useEffect(() => {
        // Event KPI
        setSelectedEventType('');
        setSelectedEventAttribute('');

        // Object KPI
        setSelectedObjectType('');
        setSelectedObjectAttribute('');

        // Combination KPI
        setSelectedLeftObjectType('');
        setSelectedLeftAttribute('');
        setSelectedRightObjectType('');
        setSelectedRightAttribute('');
        setSelectedOperation('');

        setLeftIntraCaseAgg('');
        setRightIntraCaseAgg('');

        setFromActivity('');
        setToActivity('');
        setSelectedObjectTypeActivity('');

        setShouldFetchStats(false);
    }, [selectedCaseType]);

    useEffect(() => {
        if (!metadata?.object_types?.length) return;

        const firstObject = metadata.object_types[0];
        const firstAttribute = firstObject.attributes.find((a: any) => a.numeric);

        if (!selectedObjectType && selectedCaseType === 'case_attribute_object_type') {
            setSelectedObjectType(firstObject.name);
            setSelectedObjectAttribute(firstAttribute?.name ?? '');
        }

        if (!selectedLeftObjectType && selectedCaseType === 'attribute_combination') {
            setSelectedLeftObjectType(firstObject.name);
            setSelectedLeftAttribute(firstAttribute?.name ?? '');
            setLeftIntraCaseAgg('sum');
            setSelectedOperation('add');
        }

        if (!selectedRightObjectType && selectedCaseType === 'attribute_combination') {
            setSelectedRightObjectType(firstObject.name);
            setSelectedRightAttribute(firstAttribute?.name ?? '');
            setRightIntraCaseAgg('sum');
            setSelectedOperation('add');
        }
        if (
            !selectedObjectTypeActivity ||
            (selectedObjectTypeActivity === '' && selectedCaseType === 'activity_time')
        ) {
            const objectType = firstObject.name;

            setSelectedObjectTypeActivity(objectType);
            loadActivitySuccessors(fileId!, objectType);
        }
    }, [metadata, selectedObjectType, selectedLeftObjectType, selectedRightObjectType, selectedObjectTypeActivity]);

    const objectTypeOptions = useMemo(() => {
        return (
            metadata?.object_types.filter((objectType: any) =>
                objectType.attributes?.some((attr: any) => attr.numeric)
            ) ?? []
        );
    }, [metadata]);

    const eventTypeOptions = useMemo(() => {
        return metadata?.event_types ?? [];
    }, [metadata]);

    const numericAttributes = useMemo(() => {
        const objectType = metadata?.object_types.find((item: any) => item.name === selectedObjectType);

        return objectType?.attributes.filter((attr: any) => attr.numeric) ?? [];
    }, [metadata, selectedObjectType]);

    const numericAttributesLeft = useMemo(() => {
        const objectType = metadata?.object_types.find((item: any) => item.name === selectedLeftObjectType);

        return objectType?.attributes.filter((attr: any) => attr.numeric) ?? [];
    }, [metadata, selectedLeftObjectType]);

    const numericAttributesRight = useMemo(() => {
        const objectType = metadata?.object_types.find((item: any) => item.name === selectedRightObjectType);

        return objectType?.attributes.filter((attr: any) => attr.numeric) ?? [];
    }, [metadata, selectedRightObjectType]);

    const numericAttributesObject = useMemo(() => {
        const objectType = metadata?.object_types.find((item: any) => item.name === selectedObjectType);

        return objectType?.attributes?.filter((attr: any) => attr.numeric) ?? [];
    }, [metadata, selectedObjectType]);

    return {
        // metadata / query state
        metadata,
        metadataLoading,
        metadataError,
        nodeId,

        // selections
        selectedLeftObjectType,
        setSelectedLeftObjectType,
        selectedRightObjectType,
        setSelectedRightObjectType,
        selectedLeftEventType,
        setSelectedLeftEventType,
        selectedRightEventType,
        setSelectedRightEventType,
        selectedEventType,
        setSelectedEventType,
        selectedObjectType,
        setSelectedObjectType,
        selectedObjectTypeActivity,
        setSelectedObjectTypeActivity,
        selectedLeftAttribute,
        setSelectedLeftAttribute,
        selectedRightAttribute,
        setSelectedRightAttribute,
        selectedObjectAttribute,
        setSelectedObjectAttribute,
        selectedEventAttribute,
        setSelectedEventAttribute,
        selectedOperation,
        setSelectedOperation,
        currentCnFileId,
        setCurrentCnFileId,
        selectedHistogramOption,
        setSelectedHistogramOption,
        showHistogram,
        setShowHistogram,
        histogramData,
        setHistogramData,
        selectedBins,
        setSelectedBins,
        isApplyingFilter,
        setIsApplyingFilter,
        isMiningKPI,
        setIsMiningKPI,
        activityHistogramData,
        setActivityHistogramData,
        showActivityHistogram,
        setShowActivityHistogram,
        selectedActivityBins,
        setSelectedActivityBins,
        selectedCaseType,
        setSelectedCaseType,
        hasUnminedChanges,
        setHasUnminedChanges,
        shouldFetchStats,
        setShouldFetchStats,
        fromActivity,
        setFromActivity,
        toActivity,
        setToActivity,
        successors,
        leftIntraCaseAgg,
        setLeftIntraCaseAgg,
        rightIntraCaseAgg,
        setRightIntraCaseAgg,
        intraCaseAgg,
        setIntraCaseAgg,
        showStatsChart,
        setShowStatsChart,
        filteredCaseFileId,
        setFilteredCaseFileId,
        kpiFilterPayload,
        setKpiFilterPayload,
        aggregation,
        setAggregation,

        // derived values
        activityBins,
        hasActivityHistogram,
        bins,
        hasHistogram,
        statsChartData,
        histogramChartData,
        fromActivityOptions,
        toActivityOptions,
        objectTypeOptions,
        eventTypeOptions,
        numericAttributes,
        numericAttributesLeft,
        numericAttributesRight,
        numericAttributesObject,
        histogramFilter,
        params,

        // stats query results
        stats,
        attributeStatsLoading,
        attributeStatsError,
        IsApplyingFilter,

        // handlers
        applyHistogramFilter,
        handleExportNode,
        formatDuration,
        loadActivitySuccessors,
        handleMine,
    };
}

export type KpiDashboardState = ReturnType<typeof useKpiDashboard>;
