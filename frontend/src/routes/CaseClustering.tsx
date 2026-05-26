// ...existing code...
import React, { useEffect, useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useParams } from 'react-router-dom';
import { generate } from 'storybook/internal/babel';
import { Button } from '~/components/ui/button';
//später löschen
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { useExploreFlowStore } from '~/stores/exploreStore';
import exampleClusterdata from '~/routes/CaseClusteringExamples/clustering_example_new.json';

const CaseClustering: React.FC = () => {
    const { nodeId } = useParams<{ nodeId: string }>();
    const { getNode } = useExploreFlowStore();

    const [params, setParams] = useState({
        visMethod: 'tabular-simple', //'tabular-detailed', 'graphic'
        k: 2,
    });

    const [clusteringRaw, setClusteringRaw] = useState<any | null>(null);
    const [nodes, setNodes] = useState<any[]>([]);
    const [edges, setEdges] = useState<any[]>([]);
    const [generateVis, setGenerateVis] = useState(false);
    const [reloadTable, setReloadTable] = useState(false);

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

    const runInfo = useMemo(() => clusteringRaw?.run ?? null, [clusteringRaw]);

    const tableData = useMemo(() => {
        if (reloadTable===true) {setReloadTable(false);}
        if (!generateVis || !clusteringRaw) return [];
        if (params.visMethod==='tabular-simple') {
            console.log('loading tableData');
            // fallback mock data until clusteringRaw is wired
            return clusteringRaw.case_assignments.map(([caseId, cluster_id]: [number, number]) => ({
                caseId,
                cluster_id,
            }));
        }
        if (params.visMethod==='tabular-detailed') {
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
    }, [clusteringRaw, generateVis, reloadTable]);

    const tableColumns = useMemo(() => {
        if (reloadTable===true) {setReloadTable(false);}
        if (params.visMethod==='tabular-simple') {
            return [
                {
                    accessorKey: 'caseId',
                    header: 'Id',
                },
                {
                    accessorKey: 'cluster_id',
                    header: 'Cluster',
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
            },
            {
                accessorKey: 'x',
                header: 'X',
            },
            {
                accessorKey: 'y',
                header: 'Y',
            },
        ];
    }, [clusteringRaw, generateVis, reloadTable]);

    const table = useReactTable({
        data: tableData,
        columns: tableColumns,
        getCoreRowModel: getCoreRowModel(),
    });

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

                            <label className="block mb-2 text-sm">Number of clusters (k)</label>
                            <input
                                type="number"
                                value={params.k}
                                onChange={(e) => setParams((s) => ({ ...s, k: Number(e.target.value) }))}
                                className="mb-4 w-full rounded border px-2 py-1"
                            />

                            <Button
                                onClick={() => { 
                                    if(generateVis===true) {setReloadTable(true);}
                                    setGenerateVis(true);
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
                            {!generateVis ? (
                                <div className="text-sm text-muted-foreground p-4">Click "Output" to load table</div>
                            ) : (
                                <Table>
                                    <TableCaption>Clustering output (tabular view)</TableCaption>

                                    <TableHeader>
                                        {table.getHeaderGroups().map((headerGroup: any) => (
                                            <TableRow key={headerGroup.id}>
                                                {headerGroup.headers.map((header: any) => (
                                                    <TableHead key={header.id}>
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
                        </main>

                        <aside className="w-64 min-w-[16rem] rounded-md border p-4 bg-background">
                            <h3 className="mb-2 text-sm font-semibold">Debug / Run Info</h3>
                            <div className="text-xs">File ID: {clusteringRaw?.file_id ?? '-'}</div>
                            <div className="text-xs">
                                Clusters:{' '}
                                {clusteringRaw?.case_assignments
                                    ? new Set(clusteringRaw.case_assignments.map(([, c]: any) => c)).size
                                    : '-'}
                            </div>
                            <pre className="text-xs mt-2 max-h-[60vh] overflow-auto">
                                {clusteringRaw ? JSON.stringify(runInfo ?? clusteringRaw, null, 2) : '...'}
                            </pre>
                        </aside>
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </ReactFlowProvider>
    );
};

export default CaseClustering;
// ...existing code...
