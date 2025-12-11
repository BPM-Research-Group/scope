import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { OcelVisualizationD3Props } from '~/components/graph_visualization/types';
import { useGraphInteractions } from '~/components/graph_visualization/useGraphInteractions';
import OcelCollectionSidebar from '~/components/OcelCollectionSidebar';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useGetOcel, useGetOcelCollection } from '~/services/queries';

const MAX_CHUNK = 5;

const OcelVisualization: React.FC<OcelVisualizationD3Props> = ({
    fileId,
    isFullScreen = false,
    sourceType = 'ocelFileNode',
}) => {
    // 1. Setup Data Stores & Type Checks
    const { getColorForObject } = useExploreFlowStore();

    const isCollection = sourceType === 'ocelCollectionNode';
    const isOcel = sourceType === 'ocelFileNode';

    // 2. Data Fetching (Dual Strategy for File vs Collection)
    const { data: ocelData, isLoading: ocelLoading, error: ocelError } = useGetOcel(isOcel ? fileId : null);
    const {
        data: collectionData,
        isLoading: collectionLoading,
        error: collectionError,
    } = useGetOcelCollection(isCollection ? fileId : null);

    const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);

    // Memoize the active data source based on selection
    const data = useMemo(() => {
        if (
            isCollection &&
            collectionData?.case_ocels &&
            collectionData.case_ocels.length > 0 &&
            selectedCaseIndex < collectionData.case_ocels.length
        ) {
            return collectionData.case_ocels[selectedCaseIndex];
        }
        return ocelData;
    }, [isCollection, collectionData, ocelData, selectedCaseIndex]);

    const isLoading = isCollection ? collectionLoading : ocelLoading;
    const error = isCollection ? collectionError : ocelError;

    // 3. Refs & State
    const svgRef = useRef<SVGSVGElement | null>(null);
    const eventsChartRef = useRef<SVGSVGElement | null>(null);
    const objectsChartRef = useRef<SVGSVGElement | null>(null);

    const [chunk, setChunk] = useState(1);
    const [selectedType, setSelectedType] = useState<string>('__ALL__');

    // 4. Interaction Hook
    // We pass fileId here (from V1) so the graph interactions can reference the correct color store ID
    const { contextMenu, handleCollapse, handleExpand, handleTypeChange } = useGraphInteractions(
        fileId,
        data,
        selectedType,
        setSelectedType,
        chunk,
        setChunk,
        svgRef
    );

    // 5. D3 Effect (Histograms with Dynamic Coloring from V1)
    useEffect(() => {
        if (!data) return;

        // Tooltip setup
        const tooltip = d3
            .select('body')
            .append('div')
            .attr('class', 'd3-tooltip')
            .style('position', 'absolute')
            .style('background', 'rgba(0,0,0,0.7)')
            .style('color', 'white')
            .style('padding', '6px 10px')
            .style('border-radius', '6px')
            .style('font-size', '12px')
            .style('pointer-events', 'none')
            .style('opacity', 0);

        // Helper to draw histograms
        const createHistogram = (ref: SVGSVGElement, dataArr: [string, number][], colorFn: (key: string) => string) => {
            const svg = d3.select(ref);
            svg.selectAll('*').remove();

            const width = svg.node()?.clientWidth || 250;
            const height = svg.node()?.clientHeight || 200;

            const margin = { top: 20, right: 20, bottom: 50, left: 40 };

            const x = d3
                .scaleBand()
                .domain(dataArr.map(([k]) => k))
                .range([margin.left, width - margin.right])
                .padding(0.2);

            const y = d3
                .scaleLinear()
                .domain([0, d3.max(dataArr, ([, v]) => v)!])
                .nice()
                .range([height - margin.bottom, margin.top]);

            svg.append('g')
                .selectAll('rect')
                .data(dataArr)
                .enter()
                .append('rect')
                .attr('x', ([k]) => x(k)!)
                .attr('y', ([, v]) => y(v))
                .attr('width', x.bandwidth())
                .attr('height', ([, v]) => y(0) - y(v))
                .attr('fill', ([key]) => colorFn(key))
                .on('mouseover', (event, [, v]) => tooltip.style('opacity', 1).html(`<strong>Count:</strong> ${v}`))
                .on('mousemove', (event) =>
                    tooltip.style('left', event.pageX + 10 + 'px').style('top', event.pageY - 20 + 'px')
                )
                .on('mouseout', () => tooltip.style('opacity', 0));

            // X Axis with rotation
            svg.append('g')
                .attr('transform', `translate(0,${height - margin.bottom})`)
                .call(d3.axisBottom(x))
                .selectAll('text')
                .attr('transform', 'rotate(-35)')
                .style('text-anchor', 'end')
                .attr('font-size', 9);

            // Y Axis
            svg.append('g').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y));
        };

        const activityCounts = d3.rollups(
            data.events || [],
            (v) => v.length,
            (d) => d.type || d.activity || 'Unknown'
        );
        const typeCounts = d3.rollups(
            Object.values(data.objects || {}),
            (v: any) => v.length,
            (d: any) => d.type || 'Unknown'
        );

        // Only render histograms if not in full screen and not a collection
        if (!isFullScreen && !isCollection) {
            // Events per activity graph: Dark Grey (from V1)
            if (eventsChartRef.current) {
                createHistogram(eventsChartRef.current, activityCounts, () => '#b6b8bcff');
            }

            // Objects per type: Colored via Store (from V1)
            if (objectsChartRef.current) {
                createHistogram(objectsChartRef.current, typeCounts, (k) => getColorForObject(fileId, k));
            }
        }

        return () => tooltip.remove();
    }, [data, isFullScreen, isCollection, fileId, getColorForObject]);

    // 6. Data Preparation
    const eventTypes: string[] = Array.isArray(data?.eventTypes)
        ? data!.eventTypes.map((t: any) => (typeof t === 'string' ? t : t.name))
        : [];

    if (!fileId) return <p>No File selected</p>;
    if (isLoading) return <p>Loading...</p>;
    if (error) return <p>Error loading OCEL data</p>;
    if (!data) return <p>No data available</p>;

    const gridLayoutClass = isFullScreen || isCollection ? 'grid-cols-1' : 'grid-cols-4';

    return (
        <div className="flex flex-row w-full h-full overflow-hidden">
            <div className="flex flex-col flex-1 h-full overflow-hidden">
                {contextMenu && (
                    <div
                        className="absolute bg-white border border-gray-300 shadow-lg rounded-md text-sm z-50"
                        style={{ left: contextMenu.x + 20, top: contextMenu.y }}
                    >
                        <button
                            className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                            onClick={() => handleCollapse(contextMenu.node.id)}
                        >
                            Collapse
                        </button>
                        <button
                            className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                            onClick={() => handleExpand(contextMenu.node.id)}
                        >
                            Expand
                        </button>
                    </div>
                )}

                <div className={`grid ${gridLayoutClass} gap-4 p-4 flex-1 overflow-auto`}>
                    {/* Main Graph Area */}
                    <div
                        className={`bg-white rounded-xl shadow p-3 relative flex flex-col ${isFullScreen || isCollection ? 'col-span-4' : 'col-span-3'}`}
                    >
                        <svg ref={svgRef} className="w-full flex-1 min-h-0 border rounded-lg bg-gray-50" />

                        {/* {chunk * MAX_CHUNK < (data.events?.length || 0) && (
                            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                                <button
                                    onClick={() => setChunk((prev) => prev + 1)}
                                    className="px-4 py-2 bg-blue-500 text-white rounded shadow hover:bg-blue-600"
                                >
                                    Load More Events ({chunk * MAX_CHUNK}/{data.events.length})
                                </button>
                            </div>
                        )} */}
                    </div>

                    {/* Side Histograms (Hidden on Fullscreen or Collection Mode) */}
                    {!isFullScreen && !isCollection && (
                        <div className="col-span-1 flex flex-col gap-4">
                            <div className="bg-white rounded-xl shadow p-3 flex-1 flex flex-col">
                                <h3 className="font-semibold mb-2 text-center text-gray-700">Events per Activity</h3>
                                <svg ref={eventsChartRef} className="w-full h-auto flex-1" />
                            </div>
                            <div className="bg-white rounded-xl shadow p-3 flex-1 flex flex-col">
                                <h3 className="font-semibold mb-2 text-center text-gray-700">Objects per Type</h3>
                                <svg ref={objectsChartRef} className="w-full h-auto flex-1" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Sidebar for Filtering and Collection Navigation */}
            <OcelCollectionSidebar
                isCollection={isCollection}
                selectedType={selectedType}
                eventTypes={eventTypes}
                handleTypeChange={handleTypeChange}
                selectedCaseIndex={selectedCaseIndex}
                setSelectedCaseIndex={setSelectedCaseIndex}
                caseCount={collectionData?.case_ocels?.length || 0}
            />
        </div>
    );
};

export default OcelVisualization;
