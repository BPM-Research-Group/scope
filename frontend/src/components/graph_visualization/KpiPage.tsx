import React, { useEffect, useMemo, useState } from 'react';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { Group } from '@visx/group';
import { scaleBand, scaleLinear, scaleOrdinal } from '@visx/scale';
import { Bar, Pie } from '@visx/shape';
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

type ObjectType = {
    name: string;
    attributes: Attribute[];
};

type EventType = {
    name: string;
    attributes: Attribute[];
};

type AttributeStatsParams = {
    attribute: string;
    object_type?: string;
    event_type?: string;
};

type Props = {
    fileId: string | null;
    sourceType: string;
};

type ChartData = {
    label: string;
    value: number;
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

    const {
        mutate,
        isPending: isMiningCaseNotion,
        data: caseNotionData,
        reset: resetCaseNotionMutation,
    } = useMineCaseNotionMutation();
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
                onSuccess: (data) => {
                    setHasUnminedChanges(false);

                    setShouldFetchStats(true);
                },
            }
        );
    };

    const params: AttributeStatsParams | null = useMemo(() => {
        if (!selectedAttribute) return null;

        return {
            attribute: selectedAttribute,
            ...(selectedObjectType && {
                object_type: selectedObjectType,
            }),
            ...(selectedEventType && {
                event_type: selectedEventType,
            }),
        };
    }, [selectedAttribute, selectedObjectType, selectedEventType]);

    const {
        data: attributeStatsData,
        isLoading: attributeStatsLoading,
        error: attributeStatsError,
    } = useAttributeStats(currentCnFileId, params, {
        enabled: shouldFetchStats && !!currentCnFileId && !!selectedAttribute,
    });

    const stats: Stats | null = attributeStatsData?.stats ?? null;

    const objectTypeOptions = useMemo(() => {
        return metadata?.object_types ?? [];
    }, [metadata]);

    const numericAttributes = useMemo(() => {
        const objectType = metadata?.object_types.find((item: any) => item.name === selectedObjectType);

        return objectType?.attributes.filter((attr: any) => attr.numeric) ?? [];
    }, [metadata, selectedObjectType]);

    const barChartData: ChartData[] = useMemo(() => {
        if (!metadata) return [];

        return metadata.object_types.map((item: any) => ({
            label: item.name,
            value: item.attributes.length,
        }));
    }, [metadata]);

    const pieChartData: ChartData[] = useMemo(() => {
        if (!metadata) return [];

        return metadata.object_types.map((item: any) => ({
            label: item.name,
            value: item.attributes.length,
        }));
    }, [metadata]);

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

                    <KpiCard title="Selected KPI" value={stats ? stats[aggregation].toFixed(2) : '-'} />

                    <KpiCard title="Attribute" value={selectedAttribute || '-'} />
                </div>

                <div className="bg-white rounded-2xl shadow p-6">
                    <h2 className="text-xl font-semibold mb-5">KPI Builder</h2>
                    <button
                        onClick={handleMine}
                        disabled={isMiningCaseNotion}
                        className="bg-blue-600 text-white px-4 py-2 rounded-xl disabled:opacity-50"
                    >
                        {isMiningCaseNotion ? 'Mining...' : 'Run KPI'}
                    </button>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Object Type</label>

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
                                className="w-full border rounded-xl px-3 py-2"
                            >
                                {objectTypeOptions.map((item: any) => (
                                    <option key={item.name} value={item.name}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Attribute</label>

                            <select
                                value={selectedAttribute}
                                onChange={(e) => {
                                    setSelectedAttribute(e.target.value), setShouldFetchStats(false);
                                }}
                                className="w-full border rounded-xl px-3 py-2"
                            >
                                {numericAttributes.map((item: any) => (
                                    <option key={item.name} value={item.name}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Aggregation</label>

                            <select
                                value={aggregation}
                                onChange={(e) => setAggregation(e.target.value as keyof Stats)}
                                className="w-full border rounded-xl px-3 py-2"
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
                            <label className="block text-sm font-medium mb-2">KPI Value</label>

                            <div className="border rounded-xl px-4 py-2 bg-slate-50 font-semibold">
                                {stats ? stats[aggregation].toFixed(2) : '-'}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl shadow p-6">
                        <h2 className="text-lg font-semibold mb-4">Object Type Counts</h2>

                        <BarChart data={barChartData} width={500} height={300} />
                    </div>

                    <div className="bg-white rounded-2xl shadow p-6">
                        <h2 className="text-lg font-semibold mb-4">Object Type Distribution</h2>

                        <PieChart data={pieChartData} width={500} height={300} />
                    </div>
                </div>
            </div>
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

type BarChartProps = {
    data: ChartData[];
    width: number;
    height: number;
};

const BarChart: React.FC<BarChartProps> = ({ data, width, height }) => {
    const margin = {
        top: 20,
        right: 20,
        bottom: 50,
        left: 60,
    };

    const xMax = width - margin.left - margin.right;

    const yMax = height - margin.top - margin.bottom;

    const xScale = scaleBand<string>({
        domain: data.map((d) => d.label),
        range: [0, xMax],
        padding: 0.3,
    });

    const yScale = scaleLinear<number>({
        domain: [0, Math.max(...data.map((d) => d.value), 1)],
        range: [yMax, 0],
        nice: true,
    });

    return (
        <svg width={width} height={height}>
            <Group left={margin.left} top={margin.top}>
                {data.map((d, index) => {
                    const barHeight = yMax - yScale(d.value);

                    return (
                        <Bar
                            key={d.label}
                            x={xScale(d.label)}
                            y={yScale(d.value)}
                            width={xScale.bandwidth()}
                            height={barHeight}
                            fill={COLORS[index % COLORS.length]}
                            rx={8}
                        />
                    );
                })}

                <AxisLeft scale={yScale} />

                <AxisBottom top={yMax} scale={xScale} />
            </Group>
        </svg>
    );
};

type PieChartProps = {
    data: ChartData[];
    width: number;
    height: number;
};

const PieChart: React.FC<PieChartProps> = ({ data, width, height }) => {
    const radius = Math.min(width, height) / 2;

    const colorScale = scaleOrdinal({
        domain: data.map((d) => d.label),
        range: COLORS,
    });

    return (
        <svg width={width} height={height}>
            <Group top={height / 2} left={width / 2}>
                <Pie data={data} pieValue={(d) => d.value} outerRadius={radius - 50}>
                    {(pie) =>
                        pie.arcs.map((arc, index) => (
                            <g key={index}>
                                <path d={pie.path(arc) || ''} fill={colorScale(arc.data.label)} />

                                <text
                                    x={pie.path.centroid(arc)[0]}
                                    y={pie.path.centroid(arc)[1]}
                                    dy=".33em"
                                    fontSize={12}
                                    textAnchor="middle"
                                    fill="white"
                                >
                                    {arc.data.label}
                                </text>
                            </g>
                        ))
                    }
                </Pie>
            </Group>
        </svg>
    );
};
