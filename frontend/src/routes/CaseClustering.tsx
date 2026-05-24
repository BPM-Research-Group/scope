// ...existing code...
import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { SidebarInset, SidebarProvider } from '~/components/ui/sidebar';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { useExploreFlowStore } from '~/stores/exploreStore';

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

    // Load the new clustering result JSON from public/example_data/clustering/
    useEffect(() => {
        const url = '/example_data/clustering/clustering_example.json';
        fetch(url)
            .then((res) => {
                if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
                return res.json();
            })
            .then((json) => setClusteringRaw(json))
            .catch((err) => {
                // eslint-disable-next-line no-console
                console.error('Load clustering example failed', err);
            });
    }, []);

    // Build simple cluster nodes (one node per cluster) and optional mappings
    useEffect(() => {
        if (!clusteringRaw?.case_assignments) {
            setNodes([]);
            setEdges([]);
            return;
        }

        try {
            const assignments: Array<[string | number, number]> = clusteringRaw.case_assignments;
            // count events per cluster and collect example event ids
            const clusterMap = new Map<number, { count: number; examples: (string | number)[] }>();
            for (const [evtIdx, clusterId] of assignments) {
                const cid = Number(clusterId);
                const entry = clusterMap.get(cid) ?? { count: 0, examples: [] };
                entry.count += 1;
                if (entry.examples.length < 3) entry.examples.push(evtIdx);
                clusterMap.set(cid, entry);
            }

            const sortedClusterIds = Array.from(clusterMap.keys()).sort((a, b) => a - b);
            const newNodes = sortedClusterIds.map((cid, idx) => {
                const meta = clusterMap.get(cid)!;
                return {
                    id: `cluster-${cid}`,
                    position: { x: (idx % 6) * 220, y: Math.floor(idx / 6) * 140 },
                    data: {
                        label: `Cluster ${cid}`,
                        subtitle: `${meta.count} events`,
                        examples: meta.examples,
                    },
                };
            });

            setNodes(newNodes);
            setEdges([]); // no inter-cluster edges for this simple view
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Build cluster nodes failed', e);
            setNodes([]);
            setEdges([]);
        }
    }, [clusteringRaw]);

    const runInfo = useMemo(() => clusteringRaw?.run ?? null, [clusteringRaw]);

    return (
        <ReactFlowProvider>
            <SidebarProvider>
                <SidebarInset>
                    <BreadcrumbNav />
                    <div className="flex h-full w-full gap-4 p-4">
                        <aside className="w-80 min-w-[18rem] rounded-md border p-4 bg-background">
                            <h2 className="mb-3 text-lg font-semibold">Case Clustering — Einstellungen</h2>

                            <div className="mb-2 text-xs">Beispiel‑Datei: <strong>clustering_example.json</strong></div>

                            <label className="block mb-2 text-sm">Algorithmus</label>
                            <select
                                value={params.clusteringAlgorithm}
                                onChange={(e) => setParams((s) => ({ ...s, clusteringAlgorithm: e.target.value }))}
                                className="mb-4 w-full rounded border px-2 py-1"
                            >
                                <option value="kmeans">k-Means</option>
                                <option value="hierarchical">Hierarchical</option>
                                <option value="dbscan">DBSCAN</option>
                            </select>

                            <label className="block mb-2 text-sm">Anzahl Cluster (k)</label>
                            <input
                                type="number"
                                value={params.k}
                                onChange={(e) => setParams((s) => ({ ...s, k: Number(e.target.value) }))}
                                className="mb-4 w-full rounded border px-2 py-1"
                            />
                        </aside>

                        <main className="flex-1 rounded-md border bg-background p-2">
                            <div className="mb-2 flex items-center justify-between px-2">
                                <h1 className="text-lg font-medium">Object‑centric Case Clustering (Test)</h1>
                                <div className="text-sm text-muted-foreground">
                                    Status: {clusteringRaw ? 'Loaded' : 'Loading…'}
                                </div>
                            </div>

                            <div className="h-[70vh] w-full rounded border">
                                <ReactFlow nodes={nodes} edges={edges} onNodesChange={() => {}} onEdgesChange={() => {}}>
                                    <Background />
                                    <Controls position="top-left" />
                                </ReactFlow>
                            </div>
                        </main>

                        <aside className="w-64 min-w-[16rem] rounded-md border p-4 bg-background">
                            <h3 className="mb-2 text-sm font-semibold">Debug / Run Info</h3>
                            <div className="text-xs">File ID: {clusteringRaw?.file_id ?? '-'}</div>
                            <div className="text-xs">Clusters: {clusteringRaw?.case_assignments ? new Set(clusteringRaw.case_assignments.map(([,c]: any) => c)).size : '-'}</div>
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