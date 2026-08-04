import React from 'react';
import type { Stats } from './types';
import type { KpiDashboardState } from './useKpiDashboard';

type KpiBuilderFormProps = {
    fileId: string | null;
    d: KpiDashboardState;
};

const selectClass = `
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
`;

const aggSelectClass = `
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
`;

export const KpiBuilderForm: React.FC<KpiBuilderFormProps> = ({ fileId, d }) => {
    const {
        selectedCaseType,
        setSelectedCaseType,
        setShouldFetchStats,
        selectedEventType,
        setSelectedEventType,
        eventTypeOptions,
        selectedEventAttribute,
        setSelectedEventAttribute,
        numericAttributesRight,
        intraCaseAgg,
        setIntraCaseAgg,
        selectedObjectType,
        setSelectedObjectType,
        metadata,
        setSelectedObjectAttribute,
        objectTypeOptions,
        selectedObjectAttribute,
        numericAttributesObject,
        selectedLeftObjectType,
        setSelectedLeftObjectType,
        setSelectedLeftAttribute,
        setLeftIntraCaseAgg,
        numericAttributesLeft,
        selectedLeftAttribute,
        leftIntraCaseAgg,
        selectedOperation,
        setSelectedOperation,
        selectedRightObjectType,
        setSelectedRightObjectType,
        setSelectedRightAttribute,
        setRightIntraCaseAgg,
        selectedRightAttribute,
        rightIntraCaseAgg,
        selectedObjectTypeActivity,
        setSelectedObjectTypeActivity,
        loadActivitySuccessors,
        fromActivity,
        setFromActivity,
        fromActivityOptions,
        toActivity,
        setToActivity,
        toActivityOptions,
        selectedHistogramOption,
        setSelectedHistogramOption,
        aggregation,
        setAggregation,
        stats,
        hasHistogram,
        setShowHistogram,
        handleMine,
        isMiningKPI,
        attributeStatsLoading,
    } = d;

    return (
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
                        className={selectClass}
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
                                className={selectClass}
                            >
                                {eventTypeOptions.map((item: any) => (
                                    <option key={item.name} value={item.name}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Event Attribute</label>

                            <select
                                value={selectedEventAttribute}
                                onChange={(e) => {
                                    setSelectedEventAttribute(e.target.value);
                                    setShouldFetchStats(false);
                                }}
                                className={selectClass}
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
                                className={aggSelectClass}
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

                                    const firstAttribute = ObjectType?.attributes.find((attr: any) => attr.numeric);

                                    setSelectedObjectAttribute(firstAttribute?.name ?? '');
                                }}
                                className={selectClass}
                            >
                                {objectTypeOptions.map((item: any) => (
                                    <option key={item.name} value={item.name}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Object Attribute</label>

                            <select
                                value={selectedObjectAttribute}
                                onChange={(e) => {
                                    const value1 = e.target.value;
                                    setSelectedObjectAttribute(value1);
                                    setShouldFetchStats(false);
                                }}
                                className={selectClass}
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
                                className={aggSelectClass}
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

                {selectedCaseType === 'attribute_combination' && (
                    <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">First Object Type</label>

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
                                className={selectClass}
                            >
                                {objectTypeOptions.map((item: any) => (
                                    <option key={item.name} value={item.name}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">First Attribute</label>

                            <select
                                value={selectedLeftAttribute}
                                onChange={(e) => {
                                    const value2 = e.target.value;
                                    setSelectedLeftAttribute(value2);
                                    setShouldFetchStats(false);
                                }}
                                className={selectClass}
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
                                className={aggSelectClass}
                            >
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
                                    setShouldFetchStats(false);
                                }}
                                className={aggSelectClass}
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
                                className={selectClass}
                            >
                                {objectTypeOptions.map((item: any) => (
                                    <option key={item.name} value={item.name}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Second Attribute</label>

                            <select
                                value={selectedRightAttribute}
                                onChange={(e) => {
                                    setSelectedRightAttribute(e.target.value);
                                    setShouldFetchStats(false);
                                }}
                                className={selectClass}
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
                                className={aggSelectClass}
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
                                className={selectClass}
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
                                className={selectClass}
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
                                className={aggSelectClass}
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

                                    loadActivitySuccessors(fileId!, selectedObjectTypeActivity);
                                }}
                                className={selectClass}
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

                                {fromActivityOptions.map((activity: string) => (
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

                                {toActivityOptions.map((activity: string) => (
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
                                className={aggSelectClass}
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
                        className={aggSelectClass}
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
                        className={selectClass}
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
    );
};

export default KpiBuilderForm;
