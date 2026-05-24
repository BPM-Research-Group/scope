// ...existing code...
import React, { useEffect, useMemo, useState } from 'react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useParams } from 'react-router-dom';
import { Button } from '~/components/ui/button';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { useExploreFlowStore } from '~/stores/exploreStore';
import exampleClusterdata from '~/routes/CaseClusteringExamples/clustering_example_new.json'; //später löschen

const CaseClustering: React.FC = () => {
    const { nodeId } = useParams<{ nodeId: string }>();
    const { getNode } = useExploreFlowStore();

    const [params, setParams] = useState({
        clusteringAlgorithm: 'kmeans',
        k: 5,
        distanceMetric: 'euclidean',
    });

    const [clusteringRaw, setClusteringRaw] = useState<any | null>(null);
    const [nodes, setNodes] = useState<any[]>([]);
    const [edges, setEdges] = useState<any[]>([]);
    const [generateVis, setGenerateVis] = useState(false);
    const [tableGenerated, setTableGenerated] = useState(false);

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

    // Use Effect for the Button
    useEffect(() => {
        if (!generateVis) {return;}
        console.log("Loaded mock data:", clusteringRaw.case_assignments.slice(0, 5)); // Log the first 5 case assignments for verification
    }, [generateVis]);

    const runInfo = useMemo(() => clusteringRaw?.run ?? null, [clusteringRaw]);

    const tableData = useMemo(() => {
        if (!generateVis || !clusteringRaw) return [];
        // fallback mock data until clusteringRaw is wired
        return clusteringRaw.case_assignments.map(([caseId, cluster]) => ({
          caseId,
          cluster,
    }));
    }, [generateVis, clusteringRaw]);

    const tableColumns = useMemo(
        () => [
            {
                accessorKey: 'caseId',
                header: 'Id',
            },
            {
                accessorKey: 'cluster',
                header: 'Cluster',
            },
        ],
        []
    );

    const table = useReactTable({
        data: tableData,
        columns: tableColumns,
        getCoreRowModel: getCoreRowModel(),
        manual: !generateVis,
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
                            <select
                                value={params.clusteringAlgorithm}
                                onChange={(e) => setParams((s) => ({ ...s, clusteringAlgorithm: e.target.value }))}
                                className="mb-4 w-full rounded border px-2 py-1"
                            >
                                <option value="tabular">Tabular</option>
                                <option value="graphic">Graphic</option>
                            </select>

                            <label className="block mb-2 text-sm">Number of clusters (k)</label>
                            <input
                                type="number"
                                value={params.k}
                                onChange={(e) => setParams((s) => ({ ...s, k: Number(e.target.value) }))}
                                className="mb-4 w-full rounded border px-2 py-1"
                            />

                            <Button
                                onClick={() => setGenerateVis(true)} //until Vis is implemented this starts the clustering output
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
                                        {table.getHeaderGroups().map((headerGroup) => (
                                            <TableRow key={headerGroup.id}>
                                                {headerGroup.headers.map((header) => (
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
                                        {table.getRowModel().rows.map((row) => (
                                            <TableRow key={row.id}>
                                                {row.getVisibleCells().map((cell) => (
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
