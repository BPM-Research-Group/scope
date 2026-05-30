// ...existing code...
import React, { useEffect, useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, getSortedRowModel, SortingState, useReactTable } from '@tanstack/react-table';
import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useParams } from 'react-router-dom';
import { generate } from 'storybook/internal/babel';
import { Button } from '~/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import ClusterVis from '~/components/ClusteringVis';
import DotDiagram from '~/components/Voronoi';
import { useExploreFlowStore } from '~/stores/exploreStore';
import exampleClusterdata from '~/routes/CaseClusteringExamples/clustering_example_new2.json';

const CaseClustering: React.FC = () => {
    const { nodeId } = useParams<{ nodeId: string }>();
    const { getNode } = useExploreFlowStore();

    const [params, setParams] = useState({
        visMethod: 'tabular-simple', //'tabular-detailed', 'graphic'
        k: 2,
        distanceMeasure: 'Dfg-typ', //'Dfg-obj'
        algorithm: 'k-medoids', //'agglomerative'
    });

    const [clusteringRaw, setClusteringRaw] = useState<any | null>(null);
    const [nodes, setNodes] = useState<any[]>([]);
    const [edges, setEdges] = useState<any[]>([]);
    const [reloadTable, setReloadTable] = useState(false);
    const [reloadMap, setReloadMap] = useState(false);
    const [generateTable, setGenerateTable] = useState(false);
    const [generateMap, setGenerateMap] = useState(false);
    const [sorting, setSorting] = useState<SortingState>([]);

    //Simuliert API function
    const getCaseNotionsMock = async () => {
        // simuliert Netzwerkzeit
        await new Promise((resolve) => setTimeout(resolve, 500));

        return exampleClusterdata;
    };

    // Load the new clustering result from the backend in the beginning. Right know a example file
    useEffect(() => {
        const loadData = async () => {
            const data = await getCaseNotionsMock();
            console.log(data);
            setClusteringRaw(data);
        };
        loadData();
    }, []);

    const tableData = useMemo(() => {
        if (reloadTable === true) {
            setReloadTable(false);
        }
        if (!generateTable || !clusteringRaw) return [];
        if (params.visMethod === 'tabular-simple') {
            console.log('loading tableData');
            // fallback mock data until clusteringRaw is wired
            return clusteringRaw.case_assignments.map(([caseId, cluster_id]: [number, number]) => ({
                caseId,
                cluster_id,
            }));
        }
        if (params.visMethod === 'tabular-detailed') {
            console.log('loading detailed tableData');
            return clusteringRaw.case_points.map((point: any) => ({
                caseId: point.case_id,
                case_index: point.case_index,
                cluster_id: point.cluster_id,
                x: point.x,
                y: point.y,
                x_norm: point.x_norm,
                y_norm: point.y_norm,
            }));
        }
    }, [clusteringRaw, generateTable, reloadTable]);

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
    }, [clusteringRaw, generateTable, reloadTable]);

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
            clusteringRaw?.case_points?.map((d: any) => ({
                id: d.id,
                x: d.x_norm,
                y: d.y_norm,
                cluster: d.cluster_id, // wichtig für Farblogik
            })) ?? []
        );
    }, [clusteringRaw]);

    return (
        <ReactFlowProvider>
            <SidebarProvider>
                <SidebarInset>
                    <BreadcrumbNav />
                    <div className="flex h-full w-full gap-4 p-4">
                        <aside className="w-80 min-w-[18rem] rounded-md border p-4 bg-background">
                            <h2 className="mb-3 text-lg font-semibold">Case Clustering — Settings</h2>

                            <div className="mb-2 text-xs">
                                Input-File: <strong>clustering_example.json</strong>
                            </div>

                            <label className="block mb-2 text-sm">Distance Measure</label>
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
                                    <SelectItem className="text-xs text-amber-600 font-semibold" value="Dfg-typ">
                                        Dfg-typ
                                    </SelectItem>
                                    <SelectItem className="text-xs text-amber-600 font-semibold" value="Dfg-obj" >
                                        Dfg-obj
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            <label className="block mb-2 text-sm">Algorithm</label>
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
                                    <SelectItem className="text-xs text-amber-600 font-semibold" value="agglomerative" >
                                        agglomerative clustering
                                    </SelectItem>
                                </SelectContent>
                            </Select>

                            <label className="block mb-2 text-sm">Number of clusters (k)</label>
                            <input
                                type="number"
                                value={params.k}
                                onChange={(e) => setParams((s) => ({ ...s, k: Number(e.target.value) }))}
                                className="mb-4 w-full rounded border px-2 py-1"
                            />

                            <label className="block mb-2 text-sm">Visualisation</label>
                            <Select
                                value={params.visMethod}
                                onValueChange={(e) => setParams((s) => ({ ...s, visMethod: e.toString() }))}
                            >
                                <SelectTrigger
                                    className="h-07 px-2 bg-gray-100 text-amber-600 hover:bg-gray-200 rounded-md w-full gap-1 text-s font-semibold"
                                    aria-label="Select Visualisation"
                                >
                                    <SelectValue placeholder="Visualisation" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem className="text-xs text-amber-600 font-semibold" value="tabular-simple">
                                        Tabular-simple
                                    </SelectItem>
                                    <SelectItem
                                        className="text-xs text-amber-600 font-semibold"
                                        value="tabular-detailed"
                                    >
                                        Tabular-detailed
                                    </SelectItem>
                                    <SelectItem className="text-xs text-amber-600 font-semibold" value="graphic">
                                        Graphic
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                            
                            <div className="mb-2 flex items-center justify-between px-2">
 
                            </div>

                            <Button
                                onClick={() => {
                                    if (generateTable === true) {
                                        setReloadTable(true);
                                    }
                                    if (
                                        params.visMethod === 'tabular-simple' ||
                                        params.visMethod === 'tabular-detailed'
                                    ) {
                                        setGenerateMap(false);
                                        setGenerateTable(true);
                                    }
                                    if (params.visMethod === 'graphic') {
                                        setGenerateTable(false);
                                        setGenerateMap(true);
                                    }
                                }} //until Vis is implemented this starts the clustering output
                                className="flex items-center h-6 px-2 bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-md"
                                aria-label="Configure case notion mining"
                            >
                                <span className="text-xs text-blue-600">Output</span>
                            </Button>

                            <div className="mb-2 flex items-center justify-between px-2">
                                <div className="text-sm text-muted-foreground">
                                    Status: {clusteringRaw ? 'Loaded' : 'Loading…'}
                                </div>
                            </div>
                        </aside>

                        <main className="flex-1 rounded-md border bg-background p-2">
                            {!generateTable ? null : (
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
                            )}
                            {!generateMap ? null : <ClusterVis width={800} height={500} data={chartData} />}
                        </main>

                        <aside className="w-64 min-w-[16rem] rounded-md border p-4 bg-background">
                            <h3 className="mb-2 text-sm font-semibold">Data Overview</h3>
                            <div className="space-y-3">
                                <div className="rounded-md border p-2">
                                    <p className="text-xs text-muted-foreground">Number of Clusters</p>
                                    <p className="text-lg font-semibold">{clusteringRaw ? clusteringRaw.run.k : 0}</p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="rounded-md border p-2">
                                    <p className="text-xs text-muted-foreground">Number of Cases</p>
                                    <p className="text-lg font-semibold">
                                        {clusteringRaw ? clusteringRaw.run.num_cases : 0}
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="rounded-md border p-2">
                                    <p className="text-xs text-muted-foreground">Average Cluster Size</p>
                                    <p className="text-lg font-semibold">
                                        {clusteringRaw ? Math.round(clusteringRaw.run.avg_cluster_size) : 0}
                                    </p>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="rounded-md border p-2">
                                    <p className="text-xs text-muted-foreground">total_runtime_seconds</p>
                                    <p className="text-lg font-semibold">
                                        {clusteringRaw ? clusteringRaw.run.total_runtime_seconds : 0}
                                    </p>
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
// ...existing code...
