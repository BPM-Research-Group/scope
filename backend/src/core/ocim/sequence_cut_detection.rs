use std::collections::{HashMap, HashSet};

use petgraph::algo::toposort;
use petgraph::graph::DiGraph;
use crate::core::ocim::auxiliary_methods::{
    connected_partitions, get_divergent_types, get_non_divergent_types,
};
use crate::core::ocim::common_data::{GlobalData, LocalData};
use crate::core::ocim::sequence_cut::is_sequence_cut_valid;
use crate::models::ocpt::OCPTOperatorType;

/// Check sequence condition 1:
/// for each non-divergent object type shared by (a,b), the closure must be
/// either bi-directional or absent in both directions.
fn check_sequence_1(
    local_data: &LocalData,
    global_data: &GlobalData,
    a: &String,
    b: &String,
) -> bool {
    for ot in get_non_divergent_types(a, b, &[a.clone(), b.clone()], global_data) {
        if let Some(clos) = local_data.clos.get(&ot) {
            let ab = clos.contains(&(a.clone(), b.clone()));
            let ba = clos.contains(&(b.clone(), a.clone()));
            // Follow the Python condition: group when both directions exist or both are absent.
            if (ab && ba) || (!ab && !ba) {
                return true;
            }
        }
    }
    false
}

/// Check sequence condition 2 on partition-level reachability.
/// Returns true if both directions are present or both absent between partitions i and j.
fn check_sequence_2(
    partition_closure: &HashSet<(usize, usize)>,
    i: usize,
    j: usize,
) -> bool {
    let ij = partition_closure.contains(&(i, j));
    let ji = partition_closure.contains(&(j, i));
    (ij && ji) || (!ij && !ji)
}

/// Check sequence condition 3:
/// if any divergent object type in the combined segment lacks bi-directional DFG edges, return true.
fn check_sequence_3(
    local_data: &LocalData,
    global_data: &GlobalData,
    partition: &[Vec<String>],
    mut i: usize,
    mut j: usize,
) -> bool {
    if i > j {
        std::mem::swap(&mut i, &mut j);
    }

    let segment: Vec<String> = partition[i..=j]
        .iter()
        .flat_map(|p| p.iter().cloned())
        .collect();

    for a in &partition[i] {
        for b in &partition[j] {
            for ot in get_divergent_types(a, b, &segment, global_data) {
                if let Some((dfg, _, _)) = local_data.dfgs.get(&ot) {
                    let ab = dfg.contains_key(&(a.clone(), b.clone()));
                    let ba = dfg.contains_key(&(b.clone(), a.clone()));
                    if !ab || !ba {
                        return true;
                    }
                }
            }
        }
    }
    false
}

/// Compute immediate partition follows edges using per-otype activity closure (no transitive step).
/// Mirrors the Python get_partition_follows_relations helper.
fn partition_edges(
    local_data: &LocalData,
    global_data: &GlobalData,
    partition: &[Vec<String>],
) -> HashSet<(usize, usize)> {
    let n = partition.len();
    let mut edges = HashSet::new();

    for i in 0..n {
        for j in 0..n {
            if i == j {
                continue;
            }
            let mut context: Vec<String> =
                Vec::with_capacity(partition[i].len() + partition[j].len());
            context.extend(partition[i].iter().cloned());
            context.extend(partition[j].iter().cloned());

            let has_edge = partition[i].iter().any(|a| {
                partition[j].iter().any(|b| {
                    get_non_divergent_types(a, b, &context, global_data)
                        .into_iter()
                        .any(|ot| {
                            local_data
                                .clos
                                .get(&ot)
                                .map(|c| c.contains(&(a.clone(), b.clone())))
                                .unwrap_or(false)
                        })
                })
            });

            if has_edge {
                edges.insert((i, j));
            }
        }
    }

    edges
}

/// Compute transitive closure of partition reachability.
/// Mirrors the Python get_transitive_closure_partition_relations helper.
fn partition_closure(
    local_data: &LocalData,
    global_data: &GlobalData,
    partition: &[Vec<String>],
) -> HashSet<(usize, usize)> {
    let n = partition.len();
    let direct_edges = partition_edges(local_data, global_data, partition);
    let mut adj = vec![vec![false; n]; n];
    for (i, j) in direct_edges {
        adj[i][j] = true;
    }

    for k in 0..n {
        for i in 0..n {
            if adj[i][k] {
                for j in 0..n {
                    if adj[k][j] {
                        adj[i][j] = true;
                    }
                }
            }
        }
    }

    let mut closure = HashSet::new();
    for i in 0..n {
        for j in 0..n {
            if i != j && adj[i][j] {
                closure.insert((i, j));
            }
        }
    }
    closure
}

/// Merge cyclic partitions (both directions reachable) into a single part.
fn remove_cycles(
    partition: Vec<Vec<String>>,
    local_data: &LocalData,
    global_data: &GlobalData,
) -> (Vec<Vec<String>>, bool) {
    let closure = partition_closure(local_data, global_data, &partition);
    let mut result = Vec::new();
    let mut done = HashSet::new();
    let mut change = false;

    for i in 0..partition.len() {
        if done.contains(&i) {
            continue;
        }
        let mut merged = partition[i].clone();
        for j in (i + 1)..partition.len() {
            if done.contains(&j) {
                continue;
            }
            if closure.contains(&(i, j)) && closure.contains(&(j, i)) {
                merged.extend(partition[j].iter().cloned());
                done.insert(j);
                change = true;
            }
        }
        done.insert(i);
        merged.sort();
        merged.dedup();
        result.push(merged);
    }

    (result, change)
}

/// Find the partition index that contains the activity.
fn partition_index(partition: &[Vec<String>], act: &str) -> Option<usize> {
    partition.iter().position(|p| p.iter().any(|x| x == act))
}

/// Build a topological ordering of partitions using direct follows edges; if cyclic, keep original order.
fn topo_order_partitions(
    partition: &[Vec<String>],
    local_data: &LocalData,
    global_data: &GlobalData,
) -> Vec<Vec<String>> {
    let edges = partition_edges(local_data, global_data, partition);
    let mut g: DiGraph<usize, ()> = DiGraph::new();
    let nodes: Vec<_> = (0..partition.len()).map(|i| g.add_node(i)).collect();
    for (i, j) in edges {
        g.add_edge(nodes[i], nodes[j], ());
    }
    match toposort(&g, None) {
        // order yields NodeIndex; use the stored weight (usize) to index the partition slice.
        Ok(order) => order
            .into_iter()
            .filter_map(|node| g.node_weight(node).copied())
            .map(|idx| partition[idx].clone())
            .collect(),
        Err(_) => partition.to_vec(),
    }
}

/// Rust port of the Python `find_cut_sequence` detection pipeline.
/// Returns Some(partitioning) if a valid sequence cut is found, otherwise None.
pub fn find_cut_sequence(
    local_data: &LocalData,
    global_data: &GlobalData,
) -> Option<(Vec<Vec<String>>, OCPTOperatorType)> {
    // Stage 1: components by check_sequence_1
    let partition = connected_partitions(&local_data.alphabet, |i, j| {
        check_sequence_1(
            local_data,
            global_data,
            &local_data.alphabet[i],
            &local_data.alphabet[j],
        )
    });
    if partition.len() == 1 {
        return None;
    }

    // Stage 2: include partition-level reachability condition
    let closure = partition_closure(local_data, global_data, &partition);
    let partition_stage1 = partition.clone();
    let partition = connected_partitions(&local_data.alphabet, |i, j| {
        check_sequence_1(
            local_data,
            global_data,
            &local_data.alphabet[i],
            &local_data.alphabet[j],
        ) || {
            let pi = partition_index(&partition_stage1, &local_data.alphabet[i]).unwrap();
            let pj = partition_index(&partition_stage1, &local_data.alphabet[j]).unwrap();
            check_sequence_2(&closure, pi, pj)
        }
    });
    if partition.len() == 1 {
        return None;
    }

    // Stage 3: order partitions topologically and re-cluster with sequence_3 condition
    let partition = topo_order_partitions(&partition, local_data, global_data);
    let closure = partition_closure(local_data, global_data, &partition);
    let partition = connected_partitions(&local_data.alphabet, |i, j| {
        let pi = partition_index(&partition, &local_data.alphabet[i]).unwrap();
        let pj = partition_index(&partition, &local_data.alphabet[j]).unwrap();
        check_sequence_1(
            local_data,
            global_data,
            &local_data.alphabet[i],
            &local_data.alphabet[j],
        ) || check_sequence_2(&closure, pi, pj)
            || check_sequence_3(local_data, global_data, &partition, pi, pj)
    });

    // Merge cycles until stable
    let mut partition = partition;
    loop {
        let (p, changed) = remove_cycles(partition, local_data, global_data);
        partition = p;
        if !changed {
            break;
        }
    }

    if partition.len() == 1 {
        return None;
    }

    // Final topological order and validation
    partition = topo_order_partitions(&partition, local_data, global_data);
    if partition.len() == 1 {
        return None;
    }

    if is_sequence_cut_valid(local_data, global_data, &partition) {
        return Some((partition, OCPTOperatorType::Sequence));
    } else {
        return None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::ocim::algorithm::ocim_init;
    use crate::models::ocpt::{OCPTLeafLabel, OCPTOperatorType, OCPTNode};
    use chrono::Utc;
    use process_mining::ocel::ocel_struct::{
        OCEL, OCELEvent, OCELObject, OCELRelationship, OCELType,
    };
    use std::path::Path;
    use std::thread;
    use std::time::Duration;

    // Helper to create a default empty OCEL.
    fn new_empty_ocel() -> OCEL {
        OCEL {
            events: Vec::new(),
            objects: Vec::new(),
            event_types: Vec::new(),
            object_types: Vec::new(),
        }
    }

    #[test]
    fn example_log_detects_sequence_cut_direct() {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
        let path = manifest
            .join("..")
            .join("example_data")
            .join("ocel")
            .join("example_log_ocim.json");

        let data = std::fs::read_to_string(&path).expect("read example OCEL file");
        let ocel: OCEL = serde_json::from_str(&data).expect("parse example OCEL");

        let local = LocalData::new(vec![ocel.clone()], None);
        let global = GlobalData::new(vec![ocel]);

        let cut = find_cut_sequence(&local, &global)
            .expect("expected sequence cut for example OCEL (direct call)");
        assert_eq!(
            cut.0,
            vec![
                vec!["identify".to_string(), "reject".to_string()],
                vec!["place".to_string()],
                vec!["pay".to_string(), "produce".to_string()],
                vec!["send".to_string(), "store".to_string()],
            ]
        );
    }

    #[test]
    fn test_simple_sequence_cut() {
        // 1. Setup: Create an OCEL with two events (A, B) and one object (O1)
        //    connected to both. Events are ordered to form a sequence.
        let mut ocel = new_empty_ocel();

        // Object and its type
        let obj1 = OCELObject {
            id: "O1".to_string(),
            object_type: "OT1".to_string(),
            attributes: Vec::new(),
            relationships: Vec::new(),
        };
        ocel.objects.push(obj1);
        ocel.object_types.push(OCELType {
            name: "OT1".to_string(),
            attributes: Vec::new(),
        });

        // Event A
        let event_a = OCELEvent {
            id: "eA".to_string(),
            event_type: "A".to_string(),
            time: Utc::now().into(),
            attributes: Vec::new(),
            relationships: vec![OCELRelationship {
                object_id: "O1".to_string(),
                qualifier: "rel".to_string(),
            }],
        };
        ocel.events.push(event_a);
        ocel.event_types.push(OCELType {
            name: "A".to_string(),
            attributes: Vec::new(),
        });

        thread::sleep(Duration::from_millis(10)); // Ensure distinct timestamps for ordering

        // Event B
        let event_b = OCELEvent {
            id: "eB".to_string(),
            event_type: "B".to_string(),
            time: Utc::now().into(),
            attributes: Vec::new(),
            relationships: vec![OCELRelationship {
                object_id: "O1".to_string(),
                qualifier: "rel".to_string(),
            }],
        };
        ocel.events.push(event_b);
        ocel.event_types.push(OCELType {
            name: "B".to_string(),
            attributes: Vec::new(),
        });

        // 2. Act: Run the OCIM algorithm
        let ocpt = ocim_init(&vec![ocel.clone()]);
        dbg!(&ocpt);

        // 3. Assert: Check if the root node is a Sequence Operator
        if let OCPTNode::Operator(op) = ocpt.root {
            assert!(matches!(op.operator_type, OCPTOperatorType::Sequence));
            assert_eq!(op.children.len(), 2);

            // Further check children to be Activity A and Activity B
            if let OCPTNode::Leaf(leaf_a) = &op.children[0] {
                if let OCPTLeafLabel::Activity(activity_name) = &leaf_a.activity_label {
                    assert_eq!(activity_name, "A");
                } else {
                    panic!("Expected Activity A leaf");
                }
            } else {
                panic!("Expected first child to be a LeafNode");
            }

            if let OCPTNode::Leaf(leaf_b) = &op.children[1] {
                if let OCPTLeafLabel::Activity(activity_name) = &leaf_b.activity_label {
                    assert_eq!(activity_name, "B");
                } else {
                    panic!("Expected Activity B leaf");
                }
            } else {
                panic!("Expected second child to be a LeafNode");
            }
        } else {
            panic!("Expected a Sequence OperatorNode, but found {:?}", ocpt.root);
        }
    }
}
