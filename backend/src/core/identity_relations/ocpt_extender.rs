use std::collections::HashSet;

use crate::models::ocpt::{IdentityRelation, OCPTLeafLabel, OCPTNode, OCPTOperator};

use super::{check_relation, Relation};

fn collect_activities(node: &OCPTNode, out: &mut HashSet<String>) {
    match node {
        OCPTNode::Leaf(leaf) => {
            if let OCPTLeafLabel::Activity(activity) = &leaf.activity_label {
                out.insert(activity.clone());
            }
        }
        OCPTNode::Operator(op) => {
            for child in &op.children {
                collect_activities(child, out);
            }
        }
    }
}

fn build_candidates(relations: &[Relation]) -> Vec<HashSet<String>> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut ordered: Vec<String> = Vec::new();

    for (_eid, _activity, _timestamp, _oid, otype) in relations {
        if seen.insert(otype.clone()) {
            ordered.push(otype.clone());
        }
    }

    ordered
        .into_iter()
        .map(|otype| {
            let mut set = HashSet::new();
            set.insert(otype);
            set
        })
        .collect()
}

fn set_to_sorted_vec(set: &HashSet<String>) -> Vec<String> {
    let mut items: Vec<String> = set.iter().cloned().collect();
    items.sort();
    items.dedup();
    items
}

pub fn get_extended_ocpt(
    ocpt: OCPTNode,
    relations: &[Relation],
    candidates: Option<Vec<HashSet<String>>>,
) -> OCPTNode {
    match ocpt {
        OCPTNode::Leaf(leaf) => OCPTNode::Leaf(leaf),
        OCPTNode::Operator(mut op) => {
            let mut candidates = candidates.unwrap_or_else(|| build_candidates(relations));
            if candidates.is_empty() {
                candidates = build_candidates(relations);
            }

            let mut activities = HashSet::new();
            for child in &op.children {
                collect_activities(child, &mut activities);
            }

            for ot1 in &candidates {
                for ot2 in &candidates {
                    if ot1 == ot2 {
                        continue;
                    }

                    let mut union_types = ot1.clone();
                    union_types.extend(ot2.iter().cloned());

                    let sub_relations: Vec<Relation> = relations
                        .iter()
                        .filter(|(_eid, activity, _timestamp, _oid, otype)| {
                            activities.contains(activity) && union_types.contains(otype)
                        })
                        .cloned()
                        .collect();

                    if let Some(kind) = check_relation(ot1, ot2, &sub_relations) {
                        let mut next_candidates: Vec<HashSet<String>> = candidates
                            .iter()
                            .filter(|set| *set != ot1 && *set != ot2)
                            .cloned()
                            .collect();
                        next_candidates.push(union_types);

                        let rel = IdentityRelation {
                            left: set_to_sorted_vec(ot1),
                            right: set_to_sorted_vec(ot2),
                            kind,
                        };

                        let wrapped = OCPTNode::Operator(op);
                        return OCPTNode::Operator(OCPTOperator::new_identity(
                            rel,
                            get_extended_ocpt(wrapped, relations, Some(next_candidates)),
                        ));
                    }
                }
            }

            let extended_children = op
                .children
                .into_iter()
                .map(|child| get_extended_ocpt(child, relations, Some(candidates.clone())))
                .collect();

            op.children = extended_children;
            OCPTNode::Operator(op)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::get_extended_ocpt;
    use crate::core::utils::relations::build_relations_from_ocels;
    use crate::models::ocel::OCEL;
    use crate::models::ocpt::OCPT;
    use std::collections::HashSet;
    use std::path::PathBuf;

    #[test]
    fn extend_order_management_ocpt_and_write_json() {
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let input_path = manifest_dir.join("temp").join("ocpt_order_managment_df2.json");
        let raw = std::fs::read_to_string(&input_path)
            .expect("failed to read temp/ocpt_order_managment_df2.json");
        let ocpt: OCPT = serde_json::from_str(&raw)
            .expect("failed to parse ocpt_order_managment_df2.json as OCPT");

        let ocel_path = manifest_dir
            .join("temp")
            .join("ocel_v2_126cd774-c16a-4d26-886a-6768add705c9.json");
        let ocel_raw =
            std::fs::read_to_string(&ocel_path).expect("failed to read ocel_v2_*.json");
        let ocel: OCEL =
            serde_json::from_str(&ocel_raw).expect("failed to parse ocel_v2_*.json as OCEL");
        let ocels = vec![ocel];
        let relations = build_relations_from_ocels(&ocels);

        fn singleton(value: &str) -> HashSet<String> {
            let mut set = HashSet::new();
            set.insert(value.to_string());
            set
        }

        let candidates = vec![
            singleton("items"),
            singleton("products"),
            singleton("customers"),
            singleton("orders"),
            singleton("employees"),
            singleton("packages"),
        ];

        let extended_root = get_extended_ocpt(ocpt.root, &relations, Some(candidates));
        let extended = OCPT { root: extended_root };

        let out_path = manifest_dir
            .join("temp")
            .join("ocpt_order_managment_df2_extended.json");
        let json = serde_json::to_string_pretty(&extended)
            .expect("failed to serialize extended OCPT");
        std::fs::write(&out_path, &json).expect("failed to write extended OCPT json");

        println!("{}", out_path.display());
        println!("{}", json);
    }
}
