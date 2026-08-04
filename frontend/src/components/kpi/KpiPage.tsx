import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useAttributeStats, useCaseStats, useKpiHistogramFilter, useMineKpi } from '~/services/queries';
import { createNode } from '~/lib/explore/createNode';
import { handleConnect } from '~/lib/explore/flowActions';
import { HistChart } from './HistChart';

type Stats = {
    count: number;
    min: number;
    max: number;
    mean: number;
    median: number;
    std_dev: number;
    sum: number;
};

type Op = {
    add: any;
    subtract: any;
    multiply: any;

    divide: any;
};

type Attribute = {
    name: string;
    value_type: string;
    numeric: boolean;
};

type AttributeStatsPrams = {
    left_attribute?: string;
    left_object_type?: string;
    left_event_type?: string;
    left_intra_case_agg?: 'sum' | 'mean' | 'min' | 'max' | 'max' | 'count';
    right_attribute?: string;
    right_object_type?: string;
    right_event_type?: string;
    right_intra_case_agg?: 'sum' | 'mean' | 'min' | 'max' | 'max' | 'count';
    event_type?: string;
    object_type?: string;
    attribute?: string;
    intra_case_agg?: 'sum' | 'mean' | 'min' | 'max' | 'max' | 'count';
    operation?: 'add' | 'subtract' | 'multiply' | 'divide';
};

type Props = {
    fileId: string | null;
    sourceType: string;
    Id: string;
};

interface HistogramItem {
    bin_midpoint: number;
    frequency: number;
    bin_start: number;
    bin_end: number;
}

const COLORS = ['#2563eb', '#9333ea', '#14b8a6', '#f97316'];

const AnalyticsDashboard: React.FC<Props> = ({ fileId, Id, sourceType }) => {
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
    const [selectedOperation, setSelectedOperation] = useState<'add' | 'subtract' | 'multiply' | 'divide' | ''>('add');
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
        // if (!fileId) return;
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
        // if (!selectedLeftAttribute && !selectedRightAttribute) return null;

        return {
            histogram: selectedHistogramOption,
            ...(selectedEventType && {
                event_type: selectedEventType,
            }),
            ...(selectedObjectType && {
                object_type: selectedObjectType,
            }),
            ...(selectedEventAttribute && {
                attribute: selectedEventAttribute,
            }),
            ...(selectedObjectAttribute && {
                attribute: selectedObjectAttribute,
            }),
            ...(selectedLeftAttribute && {
                left_attribute: selectedLeftAttribute,
            }),
            ...(selectedRightAttribute && {
                right_attribute: selectedRightAttribute,
            }),
            ...(selectedOperation && {
                operation: selectedOperation,
            }),
            ...(intraCaseAgg && {
                intra_case_agg: intraCaseAgg,
            }),
            ...(selectedLeftObjectType && {
                left_object_type: selectedLeftObjectType,
            }),
            ...(selectedLeftEventType && {
                left_event_type: selectedLeftEventType,
            }),
            ...(leftIntraCaseAgg && {
                left_intra_case_agg: leftIntraCaseAgg,
            }),
            ...(selectedRightObjectType && {
                right_object_type: selectedRightObjectType,
            }),
            ...(selectedRightEventType && {
                right_event_type: selectedRightEventType,
            }),
            ...(rightIntraCaseAgg && {
                right_intra_case_agg: rightIntraCaseAgg,
            }),

            ...(selectedCaseType === 'activity_time' &&
                selectedObjectTypeActivity && {
                    object_type: selectedObjectTypeActivity,
                }),
            ...(fromActivity && {
                from_activity: fromActivity,
            }),
            ...(toActivity && {
                to_activity: toActivity,
            }),
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
        leftIntraCaseAgg,
        rightIntraCaseAgg,
    ]);

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
        // enabled: shouldFetchStats && !!currentCnFileId && !!selectedLeftAttribute && !!selectedRightAttribute,
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
            // { metric: 'Count', value: stats.count },
            // { metric: 'Sum', value: stats.sum },
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

    // const objectTypeOptions = useMemo(() => {
    //     return metadata?.object_types ?? [];
    // }, [metadata]);

    useEffect(() => {
        if (!metadata?.object_types?.length) return;

        const firstObject = metadata.object_types[0];
        const firstAttribute = firstObject.attributes.find((a) => a.numeric);

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

    if (metadataLoading) {
        return <div className="p-6 text-lg font-medium">Loading KPI Dashboard...</div>;
    }

    if (metadataError) {
        return <div className="p-6 text-red-500">Failed to load metadata</div>;
    }

    return (
        <div className="w-full h-full overflow-y-auto bg-slate-100 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">KPI Dashboard</h1>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <KpiCard title="Total Events" value={metadata?.total_events ?? 0} />

                    <KpiCard title="Total Objects" value={metadata?.total_objects ?? 0} />

                    <KpiCard title="KPI Value" value={stats ? stats[aggregation].toFixed(2) : '-'} />

                    {/* <KpiCard title="Selected Attribute" value={selectedAttribute || '-'} /> */}
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">KPI Builder</h2>
                        </div>
                        <div className="flex items-center gap-3">
                            {stats && hasHistogram && (
                                <div>
                                    <button
                                        onClick={() => setShowHistogram(true)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl"
                                    >
                                        Show Histogram
                                    </button>
                                </div>
                            )}

                            <button
                                onClick={handleMine}
                                disabled={isMiningKPI}
                                className="
                bg-blue-600
                hover:bg-blue-700
                transition-colors
                text-white
                px-5
                py-2.5
                rounded-xl
                font-medium
                shadow-sm
                disabled:opacity-50
                disabled:cursor-not-allowed
            "
                            >
                                {attributeStatsLoading ? 'Running...' : 'Run KPI'}
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">KPI</label>

                            <select
                                value={selectedCaseType}
                                onChange={(e) => {
                                    const value = e.target.value;

                                    setSelectedCaseType(value);
                                    setShouldFetchStats(false);
                                }}
                                className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                            >
                                <option value="case_attribute_event_type">Case Attribute (Event Type)</option>
                                <option value="case_attribute_object_type">Case Attribute (Object Type)</option>
                                <option value="attribute_combination">Combine Attributes</option>
                                <option value="case_duration">Case Duration</option>
                                <option value="activity_time">Duration between Activities</option>
                            </select>
                        </div>

                        {selectedCaseType === 'case_attribute_event_type' && (
                            <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Event Type</label>

                                    <select
                                        value={selectedEventType}
                                        onChange={(e) => {
                                            const value = e.target.value;

                                            setSelectedEventType(value);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                                    >
                                        {eventTypeOptions.map((item: any) => (
                                            <option key={item.name} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Event Attribute
                                    </label>

                                    <select
                                        value={selectedEventAttribute}
                                        onChange={(e) => {
                                            setSelectedEventAttribute(e.target.value);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                                    >
                                        {numericAttributesRight.map((item: any) => (
                                            <option key={item.name} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Intra-Case Aggregation
                                    </label>

                                    <select
                                        value={intraCaseAgg}
                                        onChange={(e) => {
                                            setIntraCaseAgg(e.target.value as any);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
            w-full
            border
            border-slate-300
            rounded-xl
            px-4
            py-3
            bg-white
            focus:ring-2
            focus:ring-blue-500
            focus:border-blue-500
            outline-none
        "
                                    >
                                        <option value="sum">Sum per Case</option>
                                        <option value="mean">Mean per Case</option>
                                        <option value="min">Min per Case</option>
                                        <option value="max">Max per Case</option>
                                        <option value="count">Count per Case</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {selectedCaseType === 'case_attribute_object_type' && (
                            <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Object Type</label>

                                    <select
                                        value={selectedObjectType}
                                        onChange={(e) => {
                                            const value1 = e.target.value;
                                            const value = e.target.value;

                                            setSelectedObjectType(value);
                                            setShouldFetchStats(false);
                                            const ObjectType = metadata?.object_types.find(
                                                (item: any) => item.name === value1
                                            );

                                            const firstAttribute = ObjectType?.attributes.find(
                                                (attr: any) => attr.numeric
                                            );

                                            setSelectedObjectAttribute(firstAttribute?.name ?? '');
                                        }}
                                        className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                                    >
                                        {objectTypeOptions.map((item: any) => (
                                            <option key={item.name} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Object Attribute
                                    </label>

                                    <select
                                        value={selectedObjectAttribute}
                                        onChange={(e) => {
                                            const value1 = e.target.value;
                                            setSelectedObjectAttribute(value1);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                                    >
                                        {numericAttributesObject.map((item: any) => (
                                            <option key={item.name} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Intra-Case Aggregation
                                    </label>

                                    <select
                                        value={intraCaseAgg}
                                        onChange={(e) => {
                                            setIntraCaseAgg(e.target.value as any);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
            w-full
            border
            border-slate-300
            rounded-xl
            px-4
            py-3
            bg-white
            focus:ring-2
            focus:ring-blue-500
            focus:border-blue-500
            outline-none
        "
                                    >
                                        {/* <option value="">None (Default)</option> */}
                                        <option value="sum">Sum per Case</option>
                                        <option value="mean">Mean per Case</option>
                                        <option value="min">Min per Case</option>
                                        <option value="max">Max per Case</option>
                                        <option value="count">Count per Case</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {selectedCaseType === 'attribute_combination' && (
                            <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        First Object Type
                                    </label>

                                    <select
                                        value={selectedLeftObjectType}
                                        onChange={(e) => {
                                            const value1 = e.target.value;

                                            setSelectedLeftObjectType(value1);
                                            setShouldFetchStats(false);

                                            const leftObjectType = metadata?.object_types.find(
                                                (item: any) => item.name === value1
                                            );

                                            const firstAttribute = leftObjectType?.attributes.find(
                                                (attr: any) => attr.numeric
                                            );

                                            setSelectedLeftAttribute(firstAttribute?.name ?? '');
                                            setLeftIntraCaseAgg('sum');
                                        }}
                                        className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                                    >
                                        {objectTypeOptions.map((item: any) => (
                                            <option key={item.name} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        First Attribute
                                    </label>

                                    <select
                                        value={selectedLeftAttribute}
                                        onChange={(e) => {
                                            const value2 = e.target.value;
                                            setSelectedLeftAttribute(value2);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                                    >
                                        {numericAttributesLeft.map((item: any) => (
                                            <option key={item.name} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        First Intra-Case Aggregation
                                    </label>

                                    <select
                                        value={leftIntraCaseAgg}
                                        onChange={(e) => {
                                            setLeftIntraCaseAgg(e.target.value as any);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
            w-full
            border
            border-slate-300
            rounded-xl
            px-4
            py-3
            bg-white
            focus:ring-2
            focus:ring-blue-500
            focus:border-blue-500
            outline-none
        "
                                    >
                                        {/* <option value="">None (Default)</option> */}
                                        <option value="sum">Sum per Case</option>
                                        <option value="mean">Mean per Case</option>
                                        <option value="min">Min per Case</option>
                                        <option value="max">Max per Case</option>
                                        <option value="count">Count per Case</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Operation</label>

                                    <select
                                        value={selectedOperation}
                                        onChange={(e) => {
                                            setSelectedOperation(e.target.value as any);
                                            // onChange={(e) => setAggregation(e.target.value as keyof Stats)}
                                            setShouldFetchStats(false);
                                        }}
                                        className="
            w-full
            border
            border-slate-300
            rounded-xl
            px-4
            py-3
            bg-white
            focus:ring-2
            focus:ring-blue-500
            focus:border-blue-500
            outline-none
        "
                                    >
                                        <option value="add">Add</option>
                                        <option value="subtract">Subtract</option>
                                        <option value="multiply">Multiply</option>
                                        <option value="divide">Divide</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Second Object Type
                                    </label>

                                    <select
                                        value={selectedRightObjectType}
                                        onChange={(e) => {
                                            const value2 = e.target.value;

                                            setSelectedRightObjectType(value2);
                                            setShouldFetchStats(false);

                                            const rightObjectType = metadata?.object_types.find(
                                                (item: any) => item.name === value2
                                            );

                                            const firstAttribute = rightObjectType?.attributes.find(
                                                (attr: any) => attr.numeric
                                            );

                                            setSelectedRightAttribute(firstAttribute?.name ?? '');
                                            setRightIntraCaseAgg('sum');
                                        }}
                                        className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                                    >
                                        {objectTypeOptions.map((item: any) => (
                                            <option key={item.name} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Second Attribute
                                    </label>

                                    <select
                                        value={selectedRightAttribute}
                                        onChange={(e) => {
                                            setSelectedRightAttribute(e.target.value);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                                    >
                                        {numericAttributesRight.map((item: any) => (
                                            <option key={item.name} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Second Intra-Case Aggregation
                                    </label>

                                    <select
                                        value={rightIntraCaseAgg}
                                        onChange={(e) => {
                                            setRightIntraCaseAgg(e.target.value as any);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
            w-full
            border
            border-slate-300
            rounded-xl
            px-4
            py-3
            bg-white
            focus:ring-2
            focus:ring-blue-500
            focus:border-blue-500
            outline-none
        "
                                    >
                                        {/* <option value="">None (Default)</option> */}
                                        <option value="sum">Sum per Case</option>
                                        <option value="mean">Mean per Case</option>
                                        <option value="min">Min per Case</option>
                                        <option value="max">Max per Case</option>
                                        <option value="count">Count per Case</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {selectedCaseType === 'case_duration' && (
                            <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
                        )}

                        {selectedCaseType === 'case_attribute_event_type' && (
                            <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Event Type</label>

                                    <select
                                        value={selectedEventType}
                                        onChange={(e) => {
                                            const value = e.target.value;

                                            setSelectedEventType(value);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                                    >
                                        {eventTypeOptions.map((item: any) => (
                                            <option key={item.name} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Attribute</label>

                                    <select
                                        value={selectedEventAttribute}
                                        onChange={(e) => {
                                            setSelectedEventAttribute(e.target.value);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                                    >
                                        {numericAttributesRight.map((item: any) => (
                                            <option key={item.name} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Intra-Case Aggregation
                                    </label>

                                    <select
                                        value={intraCaseAgg}
                                        onChange={(e) => {
                                            setIntraCaseAgg(e.target.value as any);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
            w-full
            border
            border-slate-300
            rounded-xl
            px-4
            py-3
            bg-white
            focus:ring-2
            focus:ring-blue-500
            focus:border-blue-500
            outline-none
        "
                                    >
                                        {/* <option value="">None (Default)</option> */}
                                        <option value="sum">Sum per Case</option>
                                        <option value="mean">Mean per Case</option>
                                        <option value="min">Min per Case</option>
                                        <option value="max">Max per Case</option>
                                        <option value="count">Count per Case</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {selectedCaseType === 'activity_time' && (
                            <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Object Type</label>

                                    <select
                                        value={selectedObjectTypeActivity}
                                        onChange={(e) => {
                                            const value1 = e.target.value;
                                            const value = e.target.value;

                                            setSelectedObjectTypeActivity(value);
                                            setShouldFetchStats(false);
                                            const ObjectType = metadata?.object_types.find(
                                                (item: any) => item.name === value1
                                            );

                                            //  setSelectedObjectTypeActivity(ObjectType);
                                            loadActivitySuccessors(fileId!, selectedObjectTypeActivity);
                                        }}
                                        className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                                    >
                                        {objectTypeOptions.map((item: any) => (
                                            <option key={item.name} value={item.name}>
                                                {item.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">From</label>

                                    <select
                                        value={fromActivity}
                                        onChange={(e) => setFromActivity(e.target.value)}
                                        className="w-full border rounded-xl px-3 py-2"
                                    >
                                        <option value="">Select Activity</option>

                                        {fromActivityOptions.map((activity) => (
                                            <option key={activity} value={activity}>
                                                {activity}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">To</label>

                                    <select
                                        value={toActivity}
                                        onChange={(e) => setToActivity(e.target.value)}
                                        disabled={!fromActivity}
                                        className="w-full border rounded-xl px-3 py-2"
                                    >
                                        <option value="">Select Activity</option>

                                        {toActivityOptions.map((activity) => (
                                            <option key={activity} value={activity}>
                                                {activity}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Intra-Case Aggregation
                                    </label>

                                    <select
                                        value={intraCaseAgg}
                                        onChange={(e) => {
                                            setIntraCaseAgg(e.target.value as any);
                                            setShouldFetchStats(false);
                                        }}
                                        className="
            w-full
            border
            border-slate-300
            rounded-xl
            px-4
            py-3
            bg-white
            focus:ring-2
            focus:ring-blue-500
            focus:border-blue-500
            outline-none
        "
                                    >
                                        <option value="sum">Sum per Case</option>
                                        <option value="mean">Mean per Case</option>
                                        <option value="min">Min per Case</option>
                                        <option value="max">Max per Case</option>
                                        <option value="count">Count per Case</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Display Histogram</label>

                            <select
                                value={selectedHistogramOption.toString()}
                                onChange={(e) => {
                                    setSelectedHistogramOption(e.target.value === 'true');

                                    setShouldFetchStats(false);
                                }}
                                className="
            w-full
            border
            border-slate-300
            rounded-xl
            px-4
            py-3
            bg-white
            focus:ring-2
            focus:ring-blue-500
            focus:border-blue-500
            outline-none
        "
                            >
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Statistics</label>

                            <select
                                value={aggregation}
                                onChange={(e) => setAggregation(e.target.value as keyof Stats)}
                                className="
                    w-full
                    border
                    border-slate-300
                    rounded-xl
                    px-4
                    py-3
                    bg-white
                    focus:ring-2
                    focus:ring-blue-500
                    focus:border-blue-500
                    outline-none
                "
                            >
                                <option value="sum">Sum</option>
                                <option value="mean">Mean</option>
                                <option value="max">Max</option>
                                <option value="min">Min</option>
                                <option value="median">Median</option>
                                <option value="std_dev">Std Dev</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Result</label>

                            <div
                                className="
                    h-[50px]
                    flex
                    items-center
                    border
                    border-slate-200
                    rounded-xl
                    px-4
                    bg-slate-50
                    text-lg
                    font-semibold
                    text-slate-800
                "
                            >
                                {stats ? stats[aggregation].toFixed(2) : '-'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showStatsChart && stats && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl p-6 mx-4">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold text-slate-800">Statistical Summary Visualization</h2>

                            <button
                                onClick={() => setShowStatsChart(false)}
                                className="text-slate-500 hover:text-slate-700 text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                {statsChartData.map((item) => (
                                    <div key={item.metric} className="bg-slate-50 rounded-lg p-3 text-center">
                                        <div className="text-xs text-slate-500">{item.metric}</div>

                                        <div className="font-semibold">{item.value.toFixed(2)}</div>
                                    </div>
                                ))}
                            </div>

                            <div className="border rounded-xl p-4">
                                <div className="flex items-end justify-around h-64 gap-4 bg-slate-50 p-4 rounded">
                                    {statsChartData.map((item) => {
                                        const maxValue = Math.max(...statsChartData.map((d) => d.value));
                                        const height = (item.value / maxValue) * 100;
                                        return (
                                            <div key={item.metric} className="flex flex-col items-center gap-2">
                                                <div className="flex items-end h-32">
                                                    <div
                                                        className="w-8 bg-blue-500 rounded"
                                                        style={{ height: `${height}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-slate-600 text-center">
                                                    {item.metric}
                                                </span>
                                                <span className="text-xs font-semibold text-slate-800">
                                                    {item.value.toFixed(2)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {selectedHistogramOption == true && showHistogram && hasHistogram && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-2xl shadow-xl w-[95vw] h-[90vh] overflow-auto p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-bold">Histogram Visualization</h2>

                            <button onClick={() => setShowHistogram(false)} className="text-2xl">
                                ×
                            </button>
                        </div>

                        <div className="border rounded-xl p-4">
                            <HistChart
                                id="kpi-histogram"
                                fileId={currentCnFileId}
                                bins={bins}
                                selectedIdx={selectedBins}
                                onSelect={setSelectedBins}
                                disabled={false}
                                color="blue"
                                // event_type=""
                                // object_type={selectedObjectType}
                                width={950}
                                height={500}
                            />
                            <div className="flex items-center gap-3">
                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={applyHistogramFilter}
                                        disabled={isApplyingFilter}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl"
                                    >
                                        {IsApplyingFilter ? 'Filtering...' : 'Apply Filter'}
                                    </button>
                                </div>
                                {filteredCaseFileId && (
                                    <div className="mt-4 flex justify-end">
                                        <button
                                            disabled={!filteredCaseFileId}
                                            onClick={handleExportNode}
                                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl"
                                        >
                                            Export As Node
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showActivityHistogram && hasActivityHistogram && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-2xl shadow-xl w-[95vw] h-[90vh] overflow-auto p-6">
                        <div className="flex justify-between mb-6">
                            <h2 className="text-xl font-bold">Activity Time Histogram</h2>

                            <button onClick={() => setShowActivityHistogram(false)} className="text-2xl">
                                ×
                            </button>
                        </div>

                        <div className="border rounded-xl p-4">
                            <HistChart
                                id="activity-time-histogram"
                                fileId={currentCnFileId}
                                bins={activityBins}
                                selectedIdx={selectedActivityBins}
                                onSelect={setSelectedActivityBins}
                                disabled={false}
                                color="blue"
                                event_type="KPI"
                                object_type={selectedObjectType}
                                width={950}
                                height={500}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalyticsDashboard;

type KpiCardProps = {
    title: string;
    value: string | number;
};

const KpiCard: React.FC<KpiCardProps> = ({ title, value }) => {
    return (
        <div className="bg-white rounded-2xl shadow p-5">
            <p className="text-sm text-slate-500">{title}</p>

            <h2 className="text-2xl font-bold mt-2 text-slate-800">{value}</h2>
        </div>
    );
};
