use process_mining::OCEL;
use crate::models::ocpt::{OCPTNode, OCPT, OCPTOperatorType};
use crate::core::ocim::{
    common_data::{LocalData, GlobalData},
    basecase::basecase,
    sequence_cut_detection::find_cut_sequence,
    loop_cut_detection::find_cut_loop,
    log_splitting::split_log,
    exclusive_cut_detection::find_cut_exclusive,
    concurrent_cut_detection::find_cut_concurrent,
    fallthrough_detection::detect_fallthrough_fitness_polynomial,
    tau_cases::detect_tau_cases,
};
use uuid::Uuid;

pub fn ocim_init(logs: &Vec<OCEL>) -> OCPT {
    let local_data = LocalData::new(logs.clone(), None);
    let global_data = GlobalData::new(logs.clone());
    
    let root_node: OCPTNode = ocim_recursive(local_data, &global_data);
    OCPT::new(root_node)
}

fn ocim_recursive(local_data: LocalData, global_data: &GlobalData) -> OCPTNode {
    let mut local_data = local_data;

    if let Some((partition, operator)) = detect_tau_cases(&mut local_data, global_data) {
        let sublogs = split_log(&local_data, partition, &operator, global_data);
        let mut subtrees: Vec<OCPTNode> = Vec::new();
        if let Some(first) = sublogs.get(0) {
            subtrees.push(ocim_recursive(first.clone(), global_data));
        }
        // Second branch corresponds to tau (empty behavior) but carry all object-type sets.
        let all_types: std::collections::HashSet<String> =
            local_data.object_types.iter().cloned().collect();
        let tau_leaf = OCPTNode::Leaf(crate::models::ocpt::OCPTLeaf {
            activity_label: crate::models::ocpt::OCPTLeafLabel::Tau,
            related_ob_types: all_types.clone(),
            divergent_ob_types: all_types.clone(),
            convergent_ob_types: all_types.clone(),
            deficient_ob_types: all_types.clone(),
            uuid: Uuid::new_v4(),
        });
        subtrees.push(tau_leaf);

        let mut operator_node = OCPTNode::new_operator(operator);
        for subtree in subtrees {
            operator_node.add_child(subtree);
        }
        return operator_node;
    }

    if local_data.alphabet.len() == 1 {
        return basecase(local_data, global_data);
    }

    // Try to find a strict cut
    if let Some((partition, operator)) = find_strict_cut(&local_data, global_data) {
        // A cut was found, now split the log and recurse.

        let sublogs = split_log(&local_data, partition, &operator, global_data);
        
        //DEBUG
        match operator {
            OCPTOperatorType::Loop(_) => {
                println!("Sublogs: {:?}", sublogs);
            }
            _ => { /* No special action for other operators */ }
        }

        let subtrees: Vec<OCPTNode> = sublogs
            .into_iter()
            .map(|sublog| ocim_recursive(sublog, global_data))
            .collect();

        let mut operator_node = OCPTNode::new_operator(operator);
        for subtree in subtrees {
            operator_node.add_child(subtree);
        }
        return operator_node;

    } else {
        // If no strict cut found, try fallthrough detection.
        let (fallthrough_partition, fallthrough_operator, _score) =
            detect_fallthrough_fitness_polynomial(&local_data, global_data);

        if let (Some(partition), Some(operator)) = (fallthrough_partition, fallthrough_operator) {
            let sublogs = split_log(&local_data, partition.clone(), &operator, global_data);
            let subtrees: Vec<OCPTNode> = sublogs
                .into_iter()
                .map(|sublog| ocim_recursive(sublog, global_data))
                .collect();

            let mut operator_node = OCPTNode::new_operator(operator);
            for subtree in subtrees {
                operator_node.add_child(subtree);
            }
            return operator_node;
        }

        // No cut and no fallthrough => algorithm would usually abort or return a leaf.
        // Return a leaf indicating that no further decomposition was possible.
        return OCPTNode::new_leaf(Some("NO_CUT_FOUND".to_string()));
    }
}

pub fn find_strict_cut(local_data: &LocalData, global_data: &GlobalData) -> Option<(Vec<Vec<String>>, OCPTOperatorType)> {
    for check in [find_cut_sequence,
        find_cut_exclusive, 
        find_cut_concurrent, 
        find_cut_loop,
        ] 
    {
        if let Some((partition, operator)) = check(local_data, global_data) {
            // global_data.quality_info["cuts"].append((partition, operator))
            return Some((partition, operator));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::ocim::common_data::{GlobalData, LocalData};
    use crate::models::ocpt::{OCPTNode, OCPTOperatorType};
    use process_mining::ocel::ocel_struct::OCEL;
    use std::path::Path;

    #[test]
    fn ocim_recursive_builds_sequence_root_for_example_log() {
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

        let root = ocim_recursive(local, &global);

        println!("{}", root.pretty());
    }
}
