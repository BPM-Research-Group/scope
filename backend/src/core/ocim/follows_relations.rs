use crate::models::dfg::OCDirectlyFollowsGraph;
#[cfg(test)]
use petgraph::algo::floyd_warshall;
#[cfg(test)]
use petgraph::graph::DiGraph;
use rustc_hash::{FxHashMap, FxHashSet};

/// Namespaced helpers for cumulative and closure computations over an [`OCDirectlyFollowsGraph`].
pub struct OCGraphRelations;

impl OCGraphRelations {
    /// Compute cumulative directly-follows relations for each object type
    pub fn get_cummulative_directly_follows_relation<'a>(
        ocdfg: &'a OCDirectlyFollowsGraph<'a>,
    ) -> FxHashMap<
        String,
        (
            FxHashMap<(String, String), u32>,
            FxHashMap<String, u32>,
            FxHashMap<String, u32>,
        ),
    > {
        let mut result = FxHashMap::default();

        for (ob_type, dfg) in &ocdfg.object_type_to_dfg {
            let mut total_dfg = FxHashMap::default();
            let mut start_acts = FxHashMap::default();
            let mut end_acts = FxHashMap::default();

            for (rel, freq) in &dfg.directly_follows_relations {
                total_dfg.insert((rel.0.to_string(), rel.1.to_string()), *freq);
            }

            for act in &dfg.start_activities {
                *start_acts.entry(act.to_string()).or_insert(0) += 1;
            }
            for act in &dfg.end_activities {
                *end_acts.entry(act.to_string()).or_insert(0) += 1;
            }

            result.insert(ob_type.clone(), (total_dfg, start_acts, end_acts));
        }

        result
    }

    /// Compute transitive closure follows relation per object type (used in tests).
    #[cfg(test)]
    pub fn get_transitive_closure_follows_relation<'a>(
        ocdfg: &'a OCDirectlyFollowsGraph<'a>,
    ) -> FxHashMap<String, FxHashSet<(String, String)>> {
        let mut result = FxHashMap::default();

        for (ob_type, dfg) in &ocdfg.object_type_to_dfg {
            let activities: Vec<_> = dfg.activities.keys().cloned().collect();
            let mut g: DiGraph<String, ()> = DiGraph::new();

            let mut node_map: FxHashMap<String, _> = FxHashMap::default();
            for act in &activities {
                let node = g.add_node(act.clone());
                node_map.insert(act.clone(), node);
            }

            for (a, b) in dfg.directly_follows_relations.keys() {
                if let (Some(src), Some(dst)) = (node_map.get(a.as_ref()), node_map.get(b.as_ref()))
                {
                    g.add_edge(*src, *dst, ());
                }
            }

            // Use Floyd-Warshall to find reachability
            let closure = floyd_warshall(&g, |_| 1.0).unwrap();
            let mut closure_edges = FxHashSet::default();

            for ((src, dst), _) in closure {
                let s = g[src].clone();
                let d = g[dst].clone();
                if s != d {
                    closure_edges.insert((s, d));
                }
            }

            result.insert(ob_type.clone(), closure_edges);
        }

        result
    }

    /// Compute transitive closure per object type directly from the DFG maps.
    /// Self-loops are included.
    pub fn build_closure_from_dfgs(
        dfgs: &FxHashMap<
            String,
            (
                FxHashMap<(String, String), u32>,
                FxHashMap<String, u32>,
                FxHashMap<String, u32>,
            ),
        >,
    ) -> FxHashMap<String, FxHashSet<(String, String)>> {
        let mut result = FxHashMap::default();

        for (ot, (edges, _, _)) in dfgs {
            // collect nodes
            let mut nodes: FxHashSet<String> = FxHashSet::default();
            for (from, to) in edges.keys() {
                nodes.insert(from.clone());
                nodes.insert(to.clone());
            }

            // build adjacency list
            let mut adj: FxHashMap<String, Vec<String>> = FxHashMap::default();
            for (from, to) in edges.keys() {
                adj.entry(from.clone()).or_default().push(to.clone());
            }

            // Transitive closure using Floyd-Warshall style iteration with self-loops.
            let mut closure: FxHashSet<(String, String)> = edges.keys().cloned().collect();
            for node in &nodes {
                closure.insert((node.clone(), node.clone()));
            }

            for k in &nodes {
                for i in &nodes {
                    for j in &nodes {
                        if closure.contains(&(i.clone(), k.clone()))
                            && closure.contains(&(k.clone(), j.clone()))
                        {
                            closure.insert((i.clone(), j.clone()));
                        }
                    }
                }
            }
            result.insert(ot.clone(), closure);
        }

        result
    }
}
