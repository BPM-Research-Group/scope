import React, { useEffect, useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, getSortedRowModel, SortingState, useReactTable } from '@tanstack/react-table';
import { ParentSize } from '@visx/responsive';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import ClusterVis from '~/components/ClusteringVis';
import { useMultipleMinerOutputs } from '~/hooks/explore/useMinerAssets';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useAgglomerativeClustering, useCaseClustering, useMaterialiseClustering } from '~/services/queries';
import { MinerOutputConfig } from '~/lib/explore/flowActions';

const CaseClustering: React.FC = () => {
    const [params, setParams] = useState({
        visMethod: 'tabular-simple', //'tabular-detailed', 'graphic'
        k: 2,
        distanceMeasure: 'dfg-typ', //'dfg-obj'
        algorithm: 'k-medoids', //'agglomerative'
    });

    const navigate = useNavigate();

    const { nodeId } = useParams<{ nodeId: string }>();
    const { getNode } = useExploreFlowStore();

    const [fileId, setFileId] = useState<string | undefined>(undefined); //input asset

    const [reloadTable, setReloadTable] = useState(false);
    const [generateTable, setGenerateTable] = useState(false);
    const [generateMap, setGenerateMap] = useState(false);
    const [sorting, setSorting] = useState<SortingState>([]);
    const [loadResult, setloadResult] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const node = nodeId ? getNode(nodeId) : undefined;

    const [aggTypFileId, setaggTypFileId] = useState<string | undefined>(undefined); //Id of the calc aggTyp custering
    const [aggObjFileId, setaggObjFileId] = useState<string | undefined>(undefined); //Id of the calc aggTyp custering
    const inputFileId = params.distanceMeasure === 'dfg-typ' ? aggTypFileId : aggObjFileId; //Input for the AgglomerativeQuery, always aggTypFileId or aggObjFileId

    const [minerOutputs, setMinerOutputs] = useState<MinerOutputConfig[]>([]);
    const [outputActivated, setOutputActivated] = useState(false);

    const [slider, setSlider] = useState(false);
    const [selected, setSelected] = useState<number[]>([]);
    const [clusterMax, setclusterMax] = useState<number | undefined>(20);

    const [exportState, setExportState] = useState<string | undefined>(undefined); //undefined, 'Select a cluster', 'Exporting ...', 'Nodes Created

    const query = useCaseClustering(
        node?.id ?? '',
        fileId ?? '',
        params.distanceMeasure,
        params.algorithm,
        params.k,
        false
    );
    const aggQuery = useAgglomerativeClustering(node?.id ?? '', inputFileId ?? '', params.k, slider);
    const data = slider ? aggQuery.data : query.data;

    const matClustQuery = useMaterialiseClustering(fileId ?? ' ', data?.case_assignments ?? [0, 1], selected, false);

    //Get Assets
    useMemo(() => {
        if (node) {
            const inputFile = node.data.assets.find((asset) => asset.io === 'input');
            setFileId(inputFile?.id);
        } else {
            setFileId(undefined);
        }
    }, [node]);

    function display(option: string) {
        setParams((s) => ({ ...s, visMethod: option }));
        if (generateTable === true) {
            setReloadTable(true);
        }
        if (option === 'tabular-simple' || option === 'tabular-detailed') {
            setGenerateMap(false);
            setGenerateTable(true);
        }
        if (option === 'graphic') {
            setGenerateTable(false);
            setGenerateMap(true);
        }
    }

    // Load the new clustering result from the backend when Load button is pressed
    useEffect(() => {
        if (!loadResult) {
            return;
        }
        const loadData = async () => {
            const result = await query.refetch(); // waits to update the table until the results are in
            if (!query.isError && !result.isError) {
                display(params.visMethod);
            }
            if (params.algorithm === 'agglomerative') {
                if (params.distanceMeasure === 'dfg-typ') {
                    setaggTypFileId(result.data.file_id);
                    setclusterMax(data?.run?.num_cases);
                } else if (params.distanceMeasure === 'dfg-obj') {
                    setaggObjFileId(result.data.file_id);
                    setclusterMax(data?.run?.num_cases);
                }
            } else {
                setclusterMax(data?.run?.num_cases);
            }
        };
        loadData();
        setloadResult(false);
    }, [loadResult]);

    //Changes visualisation when the slider is used
    useEffect(() => {
        if (!slider) {
            return;
        }
        display(params.visMethod);
    }, [params.k]);

    const tableData = useMemo(() => {
        if (reloadTable === true) {
            setReloadTable(false);
        }
        if (!generateTable || !data) return [];
        if (params.visMethod === 'tabular-simple') {
            return data.case_assignments.map(([caseId, cluster_id]: [number, number]) => ({
                caseId,
                cluster_id,
            }));
        }
        if (params.visMethod === 'tabular-detailed') {
            return data.case_points.map((point: any) => ({
                caseId: point.case_id,
                case_index: point.case_index,
                cluster_id: point.cluster_id,
                x: point.x,
                y: point.y,
                x_norm: point.x_norm,
                y_norm: point.y_norm,
            }));
        }
    }, [data, generateTable, reloadTable]);

    const tableColumns = useMemo(() => {
        if (reloadTable === true) {
            setReloadTable(false);
        }
        if (params.visMethod === 'tabular-simple') {
            return [
                {
                    accessorKey: 'caseId',
                    header: 'Id',
                },
                {
                    accessorKey: 'cluster_id',
                    header: 'Cluster',
                    enableSorting: true,
                },
            ];
        }
        return [
            {
                accessorKey: 'caseId',
                header: 'Id',
            },
            {
                accessorKey: 'case_index',
                header: 'Case Index',
            },
            {
                accessorKey: 'cluster_id',
                header: 'Cluster',
                enableSorting: true,
            },
            {
                accessorKey: 'x',
                header: 'X',
            },
            {
                accessorKey: 'y',
                header: 'Y',
            },
            {
                accessorKey: 'x_norm',
                header: 'X Norm',
            },
            {
                accessorKey: 'y_norm',
                header: 'Y Norm',
            },
        ];
    }, [data, generateTable, reloadTable]);

    const table = useReactTable({
        data: tableData,
        columns: tableColumns,
        getCoreRowModel: getCoreRowModel(),
        state: { sorting },
        onSortingChange: setSorting,
        getSortedRowModel: getSortedRowModel(),
    });

    const chartData = useMemo(() => {
        return (
            data?.case_points?.map((d: any) => ({
                id: d.id,
                x: d.x_norm,
                y: d.y_norm,
                cluster: d.cluster_id,
            })) ?? []
        );
    }, [data]);

    const handleSubmit = () => {
        setSubmitted(true);
        //TODO another fetch
        return;
    };

    useMultipleMinerOutputs(nodeId ?? ' ', minerOutputs, outputActivated);

    const exportAsNode = () => {
        if (selected.length === 0) {
            setExportState('Select a cluster');
            return;
        } else {
            setExportState('Exporting ...');
        }
        const fetching = async () => {
            const result = await matClustQuery.refetch();
            const mappedOutputs: MinerOutputConfig[] = result.data.data.materialized_clusters.map((item: any) => ({
                outputAssetId: item.case_ocels_file_id, // oder wie auch immer das Feld im Backend heißt
                inputFileName:
                    'cluster_' + item.cluster_id + '_' + node?.data.assets.find((asset) => asset.io === 'input')?.name,
                outputAssetType: 'ocelCollectionFile',
                outputNodeType: 'ocelCollectionNode',
            }));
            setMinerOutputs(mappedOutputs);
            setOutputActivated(true);
            setExportState('Nodes Created');
        };
        fetching();
        return;
    };

    const toggle = (i: any) => {
        setSelected((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
    };

    return (
        <ReactFlowProvider>
            <SidebarProvider>
                <SidebarInset>
                    <BreadcrumbNav />
                    <div className="flex h-full w-full gap-4 p-4 min-h-0">
                        <aside className="w-80 min-w-[18rem] rounded-md border p-4 bg-background min-h-0">
                            <h2 className="mb-3 text-lg font-semibold">Case Clustering — Settings</h2>
                            {submitted ? (
                                <div className="flex flex-col gap-y-0.5">
                                    <p className="text-sm text-green-600">Data Submitted.</p>
                                    <hr />
                                    <label className="block mb-2 text-s mt-3"> Select Cluster: </label>
                                    <label className="block mb-2 text-s mt-3">
                                        <input
                                            type="checkbox"
                                            checked={selected.length === params.k}
                                            onChange={() => {
                                                if (selected.length === params.k) {
                                                    setSelected([]);
                                                } else {
                                                    const allIndices = Array.from({ length: params.k }, (_, i) => i);
                                                    setSelected(allIndices);
                                                }
                                            }}
                                        />
                                        Select all
                                    </label>
                                    {Array.from({ length: params.k }, (_, i) => (
                                        <label key={i}>
                                            <input
                                                type="checkbox"
                                                checked={selected.includes(i)}
                                                onChange={() => toggle(i)}
                                            />
                                            Element {i}
                                        </label>
                                    ))}
                                    <Button
                                        onClick={() => {
                                            exportAsNode();
                                        }}
                                        className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md mt-3"
                                        aria-label="Load and display the result"
                                    >
                                        <span className="text-xs text-blue-600">Export as Node</span>
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            setSubmitted(false);
                                        }}
                                        className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md mt-3"
                                        aria-label="Load and display the result"
                                    >
                                        <span className="text-xs text-blue-600">Edit</span>
                                    </Button>
                                    <Button
                                        onClick={() => {
                                            navigate(`/data/pipeline/explore`); //macht das updaten kaput -> Anders lösen
                                        }}
                                        className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md mt-3"
                                        aria-label="Load and display the result"
                                    >
                                        <span className="text-xs text-blue-600">Back to explore</span>
                                    </Button>
                                    {exportState === 'Select a cluster' ? (
                                        <p className="text-sm text-red-600">{exportState}</p>
                                    ) : exportState ? (
                                        <p className="text-sm text-green-600">{exportState}</p>
                                    ) : null}
                                    <hr />
                                </div>
                            ) : (
                                <div className="flex flex-col gap-y-0.5">
                                    <div className="mb-2 text-xs">
                                        Input-File:{' '}
                                        <strong>{node?.data.assets.find((asset) => asset.io === 'input')?.name}</strong>
                                    </div>
                                    <label className="block mb-2 text-sm mt-3">Distance Measure</label>
                                    <Select
                                        value={params.distanceMeasure}
                                        onValueChange={(e) =>
                                            setParams((s) => ({ ...s, distanceMeasure: e.toString() }))
                                        }
                                    >
                                        <SelectTrigger
                                            className="h-07 px-2 bg-gray-100 text-amber-600 hover:bg-gray-200 rounded-md w-full gap-1 text-s font-semibold"
                                            aria-label="Select Measurement"
                                        >
                                            <SelectValue placeholder="Measurement" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem
                                                className="text-xs text-amber-600 font-semibold"
                                                value="dfg-typ"
                                            >
                                                Dfg-typ
                                            </SelectItem>
                                            <SelectItem
                                                className="text-xs text-amber-600 font-semibold"
                                                value="dfg-obj"
                                            >
                                                Dfg-obj
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <label className="block mb-2 text-sm mt-3">Algorithm</label>
                                    <Select
                                        value={params.algorithm}
                                        onValueChange={(e) => setParams((s) => ({ ...s, algorithm: e.toString() }))}
                                    >
                                        <SelectTrigger
                                            className="h-07 px-2 bg-gray-100 text-amber-600 hover:bg-gray-200 rounded-md w-full gap-1 text-s font-semibold"
                                            aria-label="Select Algorithm"
                                        >
                                            <SelectValue placeholder="Algorithm" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem
                                                className="text-xs text-amber-600 font-semibold"
                                                value="k-medoids"
                                            >
                                                k-medoids
                                            </SelectItem>
                                            <SelectItem
                                                className="text-xs text-amber-600 font-semibold"
                                                value="agglomerative"
                                            >
                                                agglomerative clustering
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {params.algorithm !== 'agglomerative' ? (
                                        <label className="block mb-2 text-sm mt-3">Number of clusters (k)</label>
                                    ) : null}
                                    {params.algorithm !== 'agglomerative' ? (
                                        <input
                                            type="number"
                                            value={params.k}
                                            onChange={(e) => setParams((s) => ({ ...s, k: Number(e.target.value) }))}
                                            className="mb-4 w-full rounded border px-2 py-1"
                                        />
                                    ) : null}
                                    {params.algorithm !== 'agglomerative' && clusterMax && params.k > clusterMax ? (
                                        <p className="text-sm text-red-600">
                                            You have defined more clusters than there are cases, not all clusters will
                                            be filled.
                                        </p>
                                    ) : null}
                                    <Button
                                        onClick={() => {
                                            setloadResult(true);
                                            setSlider(false);
                                        }}
                                        disabled={params.algorithm === 'agglomerative' && inputFileId ? true : false}
                                        className={`flex items-center h-6 px-2 bg-gray-100 text-gray-800 rounded-md mt-3 ${
                                            params.algorithm === 'agglomerative' && inputFileId
                                                ? true
                                                : false
                                                  ? 'opacity-50 cursor-not-allowed pointer-events-none'
                                                  : 'hover:bg-gray-200'
                                        }`}
                                        aria-label="Load and display the result"
                                    >
                                        <span className="text-xs text-blue-600">Load</span>
                                    </Button>
                                    {params.algorithm == 'agglomerative' && inputFileId ? (
                                        <p className="text-sm text-green-600">
                                            Clustering result already exists for this input file.
                                        </p>
                                    ) : null}
                                    {params.algorithm === 'agglomerative' ? (
                                        <div className="mb-4">
                                            <div className="flex items-center justify-between text-xs mb-1">
                                                <span className="block mb-2 text-sm mt-3">Number of clusters (k)</span>
                                                <span className="font-semibold">{params.k}</span>
                                            </div>
                                            <input
                                                id="kRange"
                                                type="range"
                                                min={1}
                                                max={clusterMax ? clusterMax : 20}
                                                step={1}
                                                value={params.k}
                                                onChange={(e) => {
                                                    setParams((s) => ({ ...s, k: Number(e.target.value) }));
                                                    setSlider(true);
                                                }}
                                                className="w-full"
                                                aria-label="Number of clusters"
                                            />
                                        </div>
                                    ) : null}

                                    {query.isError ? (
                                        <p className="text-sm text-green-600">Error occured during loading</p>
                                    ) : query.isFetching ? (
                                        <p className="text-sm text-green-600">Loading...</p>
                                    ) : query.isSuccess ? (
                                        <p className="text-sm text-green-600">Loading Successfull</p>
                                    ) : (
                                        <p className="text-sm text-green-600"></p>
                                    )}
                                    <hr />
                                    <label className="block mb-2 text-s mt-3"> Visualisation</label>
                                    <div className="flex gap-2">
                                        {['tabular-simple', 'tabular-detailed', 'graphic'].map((option) => (
                                            <button
                                                key={option}
                                                onClick={() => {
                                                    display(option);
                                                }}
                                                className={`px-3 py-1 rounded-md text-xs font-semibold transition
                                            ${
                                                params.visMethod === option
                                                    ? 'bg-amber-500 text-white'
                                                    : 'bg-gray-100 text-amber-600 hover:bg-gray-200'
                                            }`}
                                            >
                                                {option}
                                            </button>
                                        ))}
                                    </div>
                                    <hr />
                                    <Button
                                        onClick={() => {
                                            handleSubmit();
                                        }}
                                        className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md mt-3"
                                        aria-label="Load and display the result"
                                    >
                                        <span className="text-xs text-blue-600">Submit</span>
                                    </Button>
                                </div>
                            )}
                        </aside>

                        {!generateTable ? null : (
                            <main className="flex-1 rounded-md border bg-background p-2 overflow-hidden">
                                <Table>
                                    <TableCaption>Clustering output (tabular view)</TableCaption>
                                    <TableHeader>
                                        {table.getHeaderGroups().map((headerGroup: any) => (
                                            <TableRow key={headerGroup.id}>
                                                {headerGroup.headers.map((header: any) => (
                                                    <TableHead
                                                        key={header.id}
                                                        onClick={header.column.getToggleSortingHandler()}
                                                        className="cursor-pointer select-none"
                                                    >
                                                        {flexRender(
                                                            header.column.columnDef.header,
                                                            header.getContext()
                                                        )}
                                                    </TableHead>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableHeader>

                                    <TableBody>
                                        {table.getRowModel().rows.map((row: any) => (
                                            <TableRow key={row.id}>
                                                {row.getVisibleCells().map((cell: any) => (
                                                    <TableCell key={cell.id}>
                                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </main>
                        )}
                        {!generateMap ? null : (
                            <main
                                className="flex-1 rounded-md border bg-background p-2 overflow-hidden w-full"
                                style={{ height: 'calc(100vh - 57px)' }} /* Limits the height to the window - the navi*/
                            >
                                <ParentSize>
                                    {({ width, height }) => (
                                        /* This guarantees a graphic ratio 1:1*/
                                        <ClusterVis
                                            width={Math.min(width, height)}
                                            height={Math.min(width, height)}
                                            data={chartData}
                                        />
                                        /* This implements a dynamic ratio to utilize the maximum screen size */
                                        /*<ClusterVis width={width} height={height} data={chartData} />*/
                                    )}
                                </ParentSize>
                            </main>
                        )}

                        <aside className="w-64 min-w-[16rem] rounded-md border p-4 bg-background min-h-0">
                            <h3 className="mb-2 text-sm font-semibold">Data Overview</h3>
                            <div className="flex flex-col gap-2">
                                <div className="space-y-3">
                                    <div className="rounded-md border p-2">
                                        <p className="text-xs text-muted-foreground">Number of Clusters</p>
                                        <p className="text-lg font-semibold">{data ? data.run.k : 0}</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="rounded-md border p-2">
                                        <p className="text-xs text-muted-foreground">Distance Measure</p>
                                        <p className="text-lg font-semibold">{data ? data.metric : 0}</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="rounded-md border p-2">
                                        <p className="text-xs text-muted-foreground">Number of Cases</p>
                                        <p className="text-lg font-semibold">{data ? data.run.num_cases : 0}</p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="rounded-md border p-2">
                                        <p className="text-xs text-muted-foreground">Average Cluster Size</p>
                                        <p className="text-lg font-semibold">
                                            {data ? Math.round(data.run.avg_cluster_size) : 0}
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="rounded-md border p-2">
                                        <p className="text-xs text-muted-foreground">total_runtime_seconds</p>
                                        <p className="text-lg font-semibold">
                                            {data ? data.run.total_runtime_seconds : 0}
                                        </p>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="rounded-md border p-2">
                                        <p className="text-xs text-muted-foreground">within_mean</p>
                                        <div className="text-lg font-semibold">
                                            {data ? (
                                                data?.run?.within_mean?.map((value: any, index: any) => (
                                                    <div key={index}>
                                                        Cluster {index + 1}: {value.toFixed(5)}
                                                    </div>
                                                ))
                                            ) : (
                                                <span>0</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="rounded-md border p-2">
                                        <p className="text-xs text-muted-foreground">within_std</p>
                                        <div className="text-lg font-semibold">
                                            {data ? (
                                                data?.run?.within_std?.map((value: any, index: any) => (
                                                    <div key={index}>
                                                        Cluster {index + 1}: {value.toFixed(5)}
                                                    </div>
                                                ))
                                            ) : (
                                                <span>0</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="rounded-md border p-2">
                                        <p className="text-xs text-muted-foreground">cluster_event_counts</p>
                                        {data?.run?.cluster_event_counts?.map((group: any, groupIndex: any) => (
                                            <div key={groupIndex} className="mb-3">
                                                <p className="text-sm font-bold text-muted-foreground">
                                                    Cluster {groupIndex + 1}
                                                </p>

                                                <div className="ml-2">
                                                    {group.map(([name, value]: [string, number]) => (
                                                        <p key={name} className="text-base font-semibold">
                                                            {name}: {value}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </aside>
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </ReactFlowProvider>
    );
};

export default CaseClustering;
