import React, { useEffect, useMemo, useState } from 'react';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale';
import { Bar, Pie } from '@visx/shape';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { useMineCaseNotionMutation } from '~/services/mutation';
import { useAttributeStats, useMineKpi } from '~/services/queries';

type Stats = {
    count: number;
    min: number;
    max: number;
    mean: number;
    median: number;
    std_dev: number;
    sum: number;
};

type Attribute = {
    name: string;
    value_type: string;
    numeric: boolean;
};

type AttributeStatsPrams = {
    attribute: string;
    object_type?: string;
    event_type?: string;
    intra_case_agg?: 'sum' | 'mean' | 'min' | 'max' | 'max' | 'count';
};

type Props = {
    fileId: string | null;
    sourceType: string;
};

const COLORS = ['#2563eb', '#9333ea', '#14b8a6', '#f97316'];

const AnalyticsDashboard: React.FC<Props> = ({ fileId }) => {
    const [selectedObjectType, setSelectedObjectType] = useState('');
    const [selectedEventType, setSelectedEventType] = useState('');

    const [selectedAttribute, setSelectedAttribute] = useState('');

    const [currentCnFileId, setCurrentCnFileId] = useState<string>('');

    const [hasUnminedChanges, setHasUnminedChanges] = useState(false);

    const [algorithm, setAlgorithm] = useState<string>('traditional');

    const [genericPayload, setGenericPayload] = useState<any>(null);
    const [shouldFetchStats, setShouldFetchStats] = useState(false);
    const { data: metadata, isLoading: metadataLoading, error: metadataError } = useMineKpi(fileId);
    const [timeKpiType, setTimeKpiType] = useState<'case_duration' | 'activity_time'>('case_duration');

    const [fromActivity, setFromActivity] = useState('');
    const [toActivity, setToActivity] = useState('');

    const [timeStats, setTimeStats] = useState<Stats | null>(null);

    const [isLoadingTimeKpi, setIsLoadingTimeKpi] = useState(false);
    const [successors, setSuccessors] = useState<Record<string, string[]>>({});
    const [isLoadingSuccessors, setIsLoadingSuccessors] = useState(false);
    const [intraCaseAgg, setIntraCaseAgg] = useState<'sum' | 'mean' | 'min' | 'max' | 'count' | ''>('');
    const [showStatsChart, setShowStatsChart] = useState(false);

    const {
        mutate,
        isPending: isMiningCaseNotion,
        data: caseNotionData,
        reset: resetCaseNotionMutation,
    } = useMineCaseNotionMutation();
    console.log('cndata');
    console.log(caseNotionData);
    const [aggregation, setAggregation] = useState<keyof Stats>('mean');

    useEffect(() => {
        if (!metadata) return;

        const firstObjectType = metadata.object_types?.[0];

        if (!firstObjectType) return;

        setSelectedObjectType(firstObjectType.name);

        const firstNumericAttribute = firstObjectType.attributes.find((attr: Attribute) => attr.numeric);

        if (firstNumericAttribute) {
            setSelectedAttribute(firstNumericAttribute.name);
        }
    }, [metadata]);

    const runCaseDurationKpi = async () => {
        if (!currentCnFileId) return;

        try {
            setIsLoadingTimeKpi(true);

            const res = await axios.get(`http://localhost:3000/v1/kpi/case_duration/${currentCnFileId}`);
            console.log(res.data.stats);
            setTimeStats(res.data.stats);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingTimeKpi(false);
        }
    };

    const runActivityTimeKpi = async () => {
        if (!currentCnFileId || !fromActivity || !toActivity) {
            return;
        }

        try {
            setIsLoadingTimeKpi(true);

            const res = await axios.get(`http://localhost:3000/v1/kpi/case_time_stats/${currentCnFileId}`, {
                params: {
                    object_type: selectedObjectType,
                    from_activity: fromActivity,
                    to_activity: toActivity,
                },
            });
            console.log('time kpi res');
            console.log(res.data);
            setTimeStats(res.data.stats);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingTimeKpi(false);
        }
    };
    const formatDuration = (seconds: number) => {
        const days = seconds / 86400;

        if (days >= 1) return `${days.toFixed(2)} d`;

        const hours = seconds / 3600;

        if (hours >= 1) return `${hours.toFixed(2)} h`;

        const minutes = seconds / 60;

        return `${minutes.toFixed(2)} min`;
    };

    const loadActivitySuccessors = async (cnId: string) => {
        try {
            setIsLoadingSuccessors(true);
            console.log(`http://localhost:3000/v1/kpi/activity_successors/${cnId}`);
            const res = await axios.get(`http://localhost:3000/v1/kpi/activity_successors/${cnId}`);

            setSuccessors(res.data.successors ?? {});
        } catch (err: any) {
            console.error('Activity Successors Error');

            console.error('Status:', err?.response?.status);
            console.error('Data:', err?.response?.data);
            console.error('URL:', err?.config?.url);
        } finally {
            setIsLoadingSuccessors(false);
        }
    };

    const handleMine = () => {
        if (!fileId || !selectedObjectType) return;

        const newCnId = uuidv4();

        setCurrentCnFileId(newCnId);

        mutate(
            {
                fileId,
                algorithm,
                objectType: selectedObjectType,
                newFileId: newCnId,
                payload: genericPayload,
            },
            {
                onSuccess: async (data) => {
                    setHasUnminedChanges(false);
                    setShouldFetchStats(true);

                    await loadActivitySuccessors(newCnId);
                },
            }
        );
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
        if (!selectedAttribute) return null;

        return {
            attribute: selectedAttribute,
            ...(selectedObjectType && {
                object_type: selectedObjectType,
            }),
            ...(selectedEventType && {
                event_type: selectedEventType,
            }),
            ...(intraCaseAgg && {
                intra_case_agg: intraCaseAgg,
            }),
        };
    }, [selectedAttribute, selectedObjectType, selectedEventType, intraCaseAgg]);

    const {
        data: attributeStatsData,
        isLoading: attributeStatsLoading,
        error: attributeStatsError,
    } = useAttributeStats(currentCnFileId, params, {
        enabled: shouldFetchStats && !!currentCnFileId && !!selectedAttribute,
    });

    const stats: Stats | null = attributeStatsData?.stats ?? null;

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

    const objectTypeOptions = useMemo(() => {
        return metadata?.object_types ?? [];
    }, [metadata]);

    const numericAttributes = useMemo(() => {
        const objectType = metadata?.object_types.find((item: any) => item.name === selectedObjectType);

        return objectType?.attributes.filter((attr: any) => attr.numeric) ?? [];
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

                    <KpiCard title="Selected Attribute" value={selectedAttribute || '-'} />
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">KPI Builder</h2>
                        </div>
                   <div className="flex items-center gap-3">
                                        {stats && (
                            <div >
                                <button
                                    onClick={() => setShowStatsChart(true)}
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
                                    Visualize
                                </button>
                            </div>

           
                        )}

                        <button
                            onClick={handleMine}
                            disabled={isMiningCaseNotion}
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
                            {isMiningCaseNotion ? 'Running...' : 'Run KPI'}
                        </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Object Type</label>

                            <select
                                value={selectedObjectType}
                                onChange={(e) => {
                                    const value = e.target.value;

                                    setSelectedObjectType(value);
                                    setShouldFetchStats(false);

                                    const objectType = metadata?.object_types.find((item: any) => item.name === value);

                                    const firstAttribute = objectType?.attributes.find((attr: any) => attr.numeric);

                                    setSelectedAttribute(firstAttribute?.name ?? '');
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
                            <label className="block text-sm font-medium text-slate-700 mb-2">Attribute</label>

                            <select
                                value={selectedAttribute}
                                onChange={(e) => {
                                    setSelectedAttribute(e.target.value);
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
                                {numericAttributes.map((item: any) => (
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
                                <option value="">None (Default)</option>
                                <option value="sum">Sum per Case</option>
                                <option value="mean">Mean per Case</option>
                                <option value="min">Min per Case</option>
                                <option value="max">Max per Case</option>
                                <option value="count">Count per Case</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Aggregation</label>

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
                            <label className="block text-sm font-medium text-slate-700 mb-2">KPI Value</label>

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

                        {/* {stats && (
                            <div className="flex justify-end mt-4">
                                <button
                                    onClick={() => setShowStatsChart(true)}
                                    className="
                px-4 py-2
                bg-blue-600
                text-white
                rounded-lg
                hover:bg-blue-700
                transition
            "
                                >
                                    📊 Visualize
                                </button>
                            </div>

           
                        )} */}
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-lg border border-slate-200 p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-2xl font-bold text-slate-800">Time KPI Analytics</h2>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setTimeKpiType('case_duration')}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                                    timeKpiType === 'case_duration'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-100 text-slate-700'
                                }`}
                            >
                                Case Duration
                            </button>

                            <button
                                onClick={() => setTimeKpiType('activity_time')}
                                className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                                    timeKpiType === 'activity_time'
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-slate-100 text-slate-700'
                                }`}
                            >
                                Activity Time
                            </button>
                        </div>
                    </div>

                    {timeKpiType === 'activity_time' && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">From Activity</label>

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
                                <label className="block text-sm font-medium mb-2">To Activity</label>

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

                            <div className="flex items-end">
                                <button
                                    onClick={runActivityTimeKpi}
                                    disabled={isLoadingTimeKpi}
                                    className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 font-medium transition"
                                >
                                    {isLoadingTimeKpi ? 'Running...' : 'Run Time KPI'}
                                </button>
                            </div>
                        </div>
                    )}

                    {timeKpiType === 'case_duration' && (
                        <div className="flex justify-end">
                            <button
                                onClick={runCaseDurationKpi}
                                disabled={isLoadingTimeKpi}
                                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-5 py-2.5 font-medium transition"
                            >
                                {isLoadingTimeKpi ? 'Running...' : 'Run Duration KPI'}
                            </button>
                        </div>
                    )}

                    {timeStats && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                            <KpiCard title="Mean" value={formatDuration(timeStats.mean)} />

                            <KpiCard title="Median" value={formatDuration(timeStats.median)} />

                            <KpiCard title="Min" value={formatDuration(timeStats.min)} />

                            <KpiCard title="Max" value={formatDuration(timeStats.max)} />
                            <KpiCard title="Count" value={formatDuration(timeStats.count)} />

                            <KpiCard title="Std Dev" value={formatDuration(timeStats.std_dev)} />
                            <KpiCard title="Sum" value={formatDuration(timeStats.sum)} />
                        </div>
                    )}
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