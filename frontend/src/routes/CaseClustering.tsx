import React, { useEffect, useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, getSortedRowModel, SortingState, useReactTable } from '@tanstack/react-table';
import { ParentSize } from '@visx/responsive';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { isError, template } from 'lodash-es';
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import ClusterVis from '~/components/ClusteringVis';
import { useMinerOutput } from '~/hooks/explore/useMinerAssets';
import { useExploreFlowStore } from '~/stores/exploreStore';
import { useAgglomerativeClustering, useCaseClustering, useMaterialiseClustering} from '~/services/queries';

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
    const [inputFileId, setInputFileId] = useState<string | undefined>(undefined);   //Input für die Query
    const [subOutputFileId, setSubOutputFileId] = useState<string | undefined>(undefined); //Final settings
    const [outputname, setOutputname] = useState<string | undefined>(undefined);

    const [slider, setSlider] = useState(false);
    const [selected, setSelected] = useState<number[]>([]);

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
    const outputFileId = data?.file_id ?? null;             //fileID of the last query return

    const matClustQuery = useMaterialiseClustering(fileId?? ' ', data?.case_assignments?? [], selected, false);

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

    // Load the new clustering result from the backend when Load button is pressed. Right know a example file is read
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
                } else if (params.distanceMeasure === 'dfg-obj') {
                    setaggObjFileId(result.data.file_id);
                }
            }
        };
        loadData();
        setloadResult(false);
    }, [loadResult]);

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
        //setSubOutputFileId()
        return;
    };

    useEffect(() => {
        console.log('nodeId, aggTypFileId: ', nodeId, aggTypFileId);
    }, [nodeId, outputFileId]);

    useMinerOutput(nodeId ?? ' ', subOutputFileId ?? null,  outputname?? ' ', 'ocelCollectionFile', 'ocelCollectionNode');

    const exportAsNode = () => {
        console.log("fileId: ", fileId);
        console.log("minOut1: ", nodeId ?? ' ', subOutputFileId ?? null, 'AllCluster', 'ocelCollectionFile', 'ocelCollectionNode');
        console.log("minOut2: ", nodeId ?? ' ', aggTypFileId ?? null, 'AllCluster2', 'ocelCollectionFile', 'ocelCollectionNode');
        console.log("aggTypFileId: ", aggTypFileId);
        setSubOutputFileId(outputFileId);
        console.log("selected: ", selected);
        const fetching = async () => {
            console.log("matClustQuery: ", outputFileId, data?.case_assignments?? [], 1, false);
            const result = await matClustQuery.refetch();
            const name = (node?.data.assets.find((asset) => asset.io === 'input')?.name +"_cluster_"+ result.data.data.materialized_clusters[0].cluster_id);
            setOutputname(name);
            setSubOutputFileId(result.data.data.materialized_clusters[0].case_ocels_file_id);
            console.log("SuboutputfileId: ", subOutputFileId);
            console.log("name: ", name);
        }
        fetching();
        navigate(`/data/pipeline/explore`);
        return;
    };

    const toggle = (i: any) => {
        console.log("i: ", i);
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
                                        <label className="block mb-2 text-s mt-3"> Select Cluster</label>
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
                                    </div>
                                ) : 
                            (<div className="flex flex-col gap-y-0.5">
                                <div className="mb-2 text-xs">
                                    Input-File:{' '}
                                    <strong>{node?.data.assets.find((asset) => asset.io === 'input')?.name}</strong>
                                </div>
                                <label className="block mb-2 text-sm mt-3">Distance Measure</label>
                                <Select
                                    value={params.distanceMeasure}
                                    onValueChange={(e) => setParams((s) => ({ ...s, distanceMeasure: e.toString() }))}
                                >
                                    <SelectTrigger
                                        className="h-07 px-2 bg-gray-100 text-amber-600 hover:bg-gray-200 rounded-md w-full gap-1 text-s font-semibold"
                                        aria-label="Select Measurement"
                                    >
                                        <SelectValue placeholder="Measurement" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem className="text-xs text-amber-600 font-semibold" value="dfg-typ">
                                            Dfg-typ
                                        </SelectItem>
                                        <SelectItem className="text-xs text-amber-600 font-semibold" value="dfg-obj">
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
                                        <SelectItem className="text-xs text-amber-600 font-semibold" value="k-medoids">
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
                                <Button
                                    onClick={() => {
                                        setloadResult(true);
                                        setSlider(false);
                                        if (params.distanceMeasure === 'dfg-typ') {
                                            setInputFileId(aggTypFileId);
                                        }
                                        if (params.distanceMeasure === 'dfg-obj') {
                                            setInputFileId(aggObjFileId);
                                        }
                                    }}
                                    className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md mt-3"
                                    aria-label="Load and display the result"
                                >
                                    <span className="text-xs text-blue-600">Load</span>
                                </Button>
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
                                            max={20}
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
                            </div>)}
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
