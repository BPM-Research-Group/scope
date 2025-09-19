use serde::Serialize;
use std::collections::{HashMap, HashSet};
use crate::models::ocpt::{TreeNode, ProcessForest};

#[derive(Serialize)]
pub struct OutputJson {
    ots: Vec<String>,
    hierarchy: HierarchyNode,
}

#[derive(Serialize)]
#[serde(untagged)]
pub enum HierarchyNode {
    Operator {
        value: String,
        children: Vec<HierarchyNode>,
    },
    Activity {
        value: ActivityValue,
    },
}

#[derive(Serialize)]
#[allow(non_snake_case)] // for isSilent, can't resolve warning since the name is required like this in the frontend
pub struct ActivityValue {
    #[serde(skip_serializing_if = "Option::is_none")]
    isSilent: Option<bool>,
    activity: String,
    ots: Vec<ObjectType>,
}

#[derive(Serialize)]
struct ObjectType {
    ot: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    exhibits: Option<Vec<String>>,
}

pub fn convert_tree(
    node: &TreeNode,
    con: &HashMap<String, Vec<String>>,
    defi: &HashMap<String, Vec<String>>,
    div: &HashMap<String, Vec<String>>,
) -> HierarchyNode {
    let is_operator = matches!(node.label.as_str(), "excl" | "seq" | "para" | "redo");

    if is_operator {
        let op = match node.label.as_str() {
            "excl" => "xor",
            "seq" => "sequence",
            "para" => "parallel",
            "redo" => "redo",
            _ => panic!("Unknown operator"),
        };
        HierarchyNode::Operator {
            value: op.to_string(),
            children: node.children.iter().map(|c| convert_tree(c, con, defi, div)).collect(),
        }
    } else {
        // activity node
        let activity = node.label.clone();

        if activity == "tau" {
            return HierarchyNode::Activity {
                value: ActivityValue {
                    isSilent: Some(true),
                    activity,
                    ots: vec![],
                },
            };
        }

        // Collect OTs from all 3 maps
        let mut ot_set: HashSet<String> = HashSet::new();
        ot_set.extend(con.get(&activity).unwrap_or(&vec![]).clone());
        ot_set.extend(defi.get(&activity).unwrap_or(&vec![]).clone());
        ot_set.extend(div.get(&activity).unwrap_or(&vec![]).clone());

        let mut ots: Vec<ObjectType> = ot_set.into_iter().map(|ot| {
            let mut exhibits = Vec::new();
            if con.get(&activity).map_or(false, |v| v.contains(&ot)) {
                exhibits.push("con".to_string());
            }
            if defi.get(&activity).map_or(false, |v| v.contains(&ot)) {
                exhibits.push("def".to_string());
            }
            if div.get(&activity).map_or(false, |v| v.contains(&ot)) {
                exhibits.push("div".to_string());
            }

            ObjectType {
                ot,
                exhibits: if exhibits.is_empty() { None } else { Some(exhibits) },
            }
        }).collect();

        ots.sort_by(|a, b| a.ot.cmp(&b.ot)); // consistent order

        HierarchyNode::Activity {
            value: ActivityValue {
                isSilent: None,
                activity,
                ots,
            },
        }
    }
}

pub fn build_output(
    forest: &ProcessForest,
    con: &HashMap<String, Vec<String>>,
    defi: &HashMap<String, Vec<String>>,
    div: &HashMap<String, Vec<String>>,
) -> OutputJson {
    // Determine unique OTs
    let all_ots: HashSet<_> = con.values()
        .chain(defi.values())
        .chain(div.values())
        .flatten()
        .cloned()
        .collect();

    let hierarchy = if forest.len() == 1 {
        convert_tree(&forest[0], con, defi, div)
    } else {
        HierarchyNode::Operator {
            value: "sequence".to_string(),
            children: forest.iter().map(|n| convert_tree(n, con, defi, div)).collect(),
        }
    };

    OutputJson {
        ots: all_ots.into_iter().collect(),
        hierarchy,
    }
}
