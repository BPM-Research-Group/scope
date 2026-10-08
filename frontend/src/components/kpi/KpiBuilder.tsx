import React from 'react';
import { HistChart } from './HistChart';
import { useKpiDashboard } from './useKpiDashboard';
import { KpiCard } from './KpiCard';
import { KpiBuilderForm } from './KpiBuilderForm';
import type { Props } from './types';

const AnalyticsDashboard: React.FC<Props> = ({ fileId, Id, sourceType }) => {
    const d = useKpiDashboard(fileId, Id);
    const {
        metadata,
        metadataLoading,
        metadataError,
        stats,
        aggregation,
        showStatsChart,
        setShowStatsChart,
        statsChartData,
        selectedHistogramOption,
        showHistogram,
        setShowHistogram,
        hasHistogram,
        currentCnFileId,
        bins,
        selectedBins,
        setSelectedBins,
        applyHistogramFilter,
        isApplyingFilter,
        IsApplyingFilter,
        filteredCaseFileId,
        handleExportNode,
        showActivityHistogram,
        setShowActivityHistogram,
        hasActivityHistogram,
        activityBins,
        selectedActivityBins,
        setSelectedActivityBins,
        selectedObjectType,
    } = d;

    if (metadataLoading) {
        return <div className="p-1 text-black-200">Loading...</div>;
    }

    if (metadataError) {
        return <div className="p-1 text-black-200">Failed to load metadata</div>;
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
                </div>

                <KpiBuilderForm fileId={fileId} d={d} />
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
                                        const maxValue = Math.max(...statsChartData.map((entry) => entry.value));
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
                                // event_type="KPI"
                                // object_type={selectedObjectType}
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
