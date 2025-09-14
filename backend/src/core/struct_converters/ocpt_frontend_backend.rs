//! Convert **[OcptFE]** to **[OCPT]** and viceversa.
use anyhow::{anyhow, Result};
use std::collections::{HashMap, HashSet};
use crate::models::ocpt::{OcptFE, HierarchyNode, ActivityValue, ObjectTypeFE as FeObjectType, OCPT, OCPTLeaf, OCPTLeafLabel, OCPTNode, OCPTOperator, OCPTOperatorType};


/// Converts a frontend OCPT [OcptFE] to a backend OCPT [OCPT].
pub fn frontend_to_backend(front: OcptFE) -> Result<OCPT> {
    let root = frontend_node_to_backend(&front.hierarchy)?;
    Ok(OCPT::new(root))
}


/// Converts a backend OCPT [OCPT] to a frontend OCPT [OcptFE].
///
/// This function collects all object types appearing in any leaf,
/// sorts them alphabetically, and then converts the backend OCPT hierarchy to a frontend hierarchy.
/// 
/// The resulting [OcptFE] is then composed of the sorted object types and the converted [HierarchyNode]s.
pub fn backend_to_frontend(ocpt: &OCPT) -> OcptFE {
    // Collect all object types appearing in any leaf (related OR marked)
    let mut all_ots: HashSet<String> = HashSet::new();
    collect_all_ots_from_node(&ocpt.root, &mut all_ots);

    let mut ots_vec: Vec<String> = all_ots.into_iter().collect();
    ots_vec.sort();

    let hierarchy = backend_node_to_frontend(&ocpt.root);

    OcptFE {
        ots: ots_vec,
        hierarchy,
    }
}

/* ========================= Frontend → Backend helpers ========================= */

/// Converts a frontend OCPT node to a backend OCPT node.
///
/// This function is used to convert a frontend OCPT [HierarchyNode] to a backend OCPT [OCPTNode].
///
/// It takes a frontend OCPT node as input and returns the corresponding backend OCPT node.
///
/// The function recursively converts all child nodes until all nodes have been converted.

fn frontend_node_to_backend(node: &HierarchyNode) -> Result<OCPTNode> {
    match node {
        HierarchyNode::Operator { value, children } => {
            let op_type = parse_operator(value)?;
            let mut op = OCPTOperator::new(op_type);
            op.children = children
                .iter()
                .map(frontend_node_to_backend)
                .collect::<Result<Vec<_>>>()?;
            Ok(OCPTNode::Operator(op))
        }
        HierarchyNode::Activity { value } => {
            let leaf = frontend_activity_to_leaf(value);
            Ok(OCPTNode::Leaf(leaf))
        }
    }
}

/// Parses a string to an [OCPTOperatorType].
///
/// The following strings are recognized and mapped to the corresponding OCPTOperatorType:
///
/// - "sequence" or "seq" -> OCPTOperatorType::Sequence
/// - "exclusivechoice" or "xor" or "choice" -> OCPTOperatorType::ExclusiveChoice
/// - "concurrency" or "parallel" or "and" or "par" -> OCPTOperatorType::Concurrency
/// - "loop" -> OCPTOperatorType::Loop(None)


fn parse_operator(s: &str) -> Result<OCPTOperatorType> {
    let k = s.trim().to_lowercase();
    Ok(match k.as_str() {
        "sequence" | "seq" => OCPTOperatorType::Sequence,
        "exclusivechoice" | "xor" | "choice" => OCPTOperatorType::ExclusiveChoice,
        "concurrency" | "parallel" | "and" | "par" => OCPTOperatorType::Concurrency,
        "loop" => OCPTOperatorType::Loop(None),
        v if v.starts_with("loop:") => {
            // Optional: parse count after "loop:" if you want to support it
            // let n = v[5..].parse::<u32>().ok();
            OCPTOperatorType::Loop(None)
        }
        other => return Err(anyhow!("Unknown operator: {other}")),
    })
}

/// Converts a frontend [ActivityValue] value to a backend [OCPTLeaf] node.
///
/// - If is_tau is true, then the leaf is created with no activity
/// - Otherwise, the leaf is created with the activity and all object types as related
///
/// - If an object type has "exhibits" information, then the leaf is updated accordingly
/// - "div" tags mark an object type as divergent
/// - "con" tags mark an object type as convergent
/// - "def" tags mark an object type as deficient
///
/// # Arguments
///
/// * `v`: The frontend [ActivityValue] to be converted
///
/// # Returns
///
/// The converted backend [OCPTLeaf] node
fn frontend_activity_to_leaf(v: &ActivityValue) -> OCPTLeaf {
    let is_tau = v.isSilent.unwrap_or(false);
    let mut leaf = if is_tau {
        OCPTLeaf::new(None)
    } else {
        // empty activity is allowed but discouraged; OCPTLeaf handles it
        OCPTLeaf::new(Some(v.activity.clone()))
    };

    for ot in &v.ots {
        let name = ot.ot.clone();
        // Mark as related by default if it appears
        leaf.related_ob_types.insert(name.clone());

        if let Some(tags) = &ot.exhibits {
            for t in tags {
                match t.to_lowercase().as_str() {
                    "div" => {
                        leaf.divergent_ob_types.insert(name.clone());
                    }
                    "con" => {
                        leaf.convergent_ob_types.insert(name.clone());
                    }
                    "def" => {
                        leaf.deficient_ob_types.insert(name.clone());
                    }
                    _ => { /* ignore unknown */ }
                }
            }
        }
    }

    leaf
}

/* ========================= Backend → Frontend helpers ========================= */

/// Converts a backend [OCPTNode] to a frontend [HierarchyNode].
///
/// - If the node is an operator, its value is converted using [stringify_operator]
/// - If the node is a leaf, its value is converted using [backend_leaf_to_activity_value]
///
/// # Arguments
///
/// * `node`: The backend [OCPTNode] to be converted
///
/// # Returns
///
/// The converted frontend [HierarchyNode]  
fn backend_node_to_frontend(node: &OCPTNode) -> HierarchyNode {
    match node {
        OCPTNode::Operator(op) => HierarchyNode::Operator {
            value: stringify_operator(&op.operator_type),
            children: op.children.iter().map(backend_node_to_frontend).collect(),
        },
        OCPTNode::Leaf(leaf) => {
            let value = backend_leaf_to_activity_value(leaf);
            HierarchyNode::Activity { value }
        }
    }
}

/// Converts an [OCPTOperatorType] to a string.
///
/// The conversion is as follows:
/// - `Sequence` -> `"sequence"`
/// - `ExclusiveChoice` -> `"exclusiveChoice"`
/// - `Concurrency` -> `"parallel"`
/// - `Loop(_cnt)` -> `"loop"` (ignoring the count parameter in the frontend)
fn stringify_operator(op: &OCPTOperatorType) -> String {
    match op {
        OCPTOperatorType::Sequence => "sequence".to_string(),
        OCPTOperatorType::ExclusiveChoice => "exclusiveChoice".to_string(),
        OCPTOperatorType::Concurrency => "parallel".to_string(),
        OCPTOperatorType::Loop(_cnt) => "loop".to_string(), // ignore parameter in FE
    }
}

/// Converts a backend [OCPTLeaf] to a frontend [ActivityValue].
///
/// - If the leaf is a tau, it is converted to an activity value with isSilent set to true and no object types
/// - If the leaf is an activity, its value is converted to an activity value with isSilent set to false and object types built from the leaf's related, divergent, convergent, and deficient object types
///
/// The resulting activity value has its object types sorted alphabetically by object type name.

fn backend_leaf_to_activity_value(leaf: &OCPTLeaf) -> ActivityValue {
    match &leaf.activity_label {
        OCPTLeafLabel::Tau => ActivityValue {
            isSilent: Some(true),
            activity: "".to_string(),
            ots: vec![], // silent node has no OT exhibits in FE
        },
        OCPTLeafLabel::Activity(act) => {
            // Build FE OT entries, merging marks per object type.
            // Index ot -> (related, divergent, convergent, deficient)
            let mut marks: HashMap<&str, (bool, bool, bool, bool)> = HashMap::new();
            for ot in &leaf.related_ob_types {
                marks.entry(ot.as_str()).or_insert((true, false, false, false)).0 = true;
            }
            for ot in &leaf.divergent_ob_types {
                marks.entry(ot.as_str()).or_insert((false, false, false, false)).1 = true;
            }
            for ot in &leaf.convergent_ob_types {
                marks.entry(ot.as_str()).or_insert((false, false, false, false)).2 = true;
            }
            for ot in &leaf.deficient_ob_types {
                marks.entry(ot.as_str()).or_insert((false, false, false, false)).3 = true;
            }

            let mut ots: Vec<FeObjectType> = marks
                .into_iter()
                .map(|(ot, (_related, divergent, convergent, deficient))| {
                    let mut exhibits: Vec<String> = Vec::new();
                    if divergent {
                        exhibits.push("div".into());
                    }
                    if convergent {
                        exhibits.push("con".into());
                    }
                    if deficient {
                        exhibits.push("def".into());
                    }
                    // If it was "related" only, exhibits can be omitted.
                    FeObjectType {
                        ot: ot.to_string(),
                        exhibits: if exhibits.is_empty() { None } else { Some(exhibits) },
                    }
                })
                .collect();

            ots.sort_by(|a, b| a.ot.cmp(&b.ot));

            ActivityValue {
                isSilent: Some(false),
                activity: act.clone(),
                ots,
            }
        }
    }
}

/// Collects all object types from a given [OCPTNode] and its children into a set.
fn collect_all_ots_from_node(node: &OCPTNode, acc: &mut HashSet<String>) {
    match node {
        OCPTNode::Operator(op) => {
            for c in &op.children {
                collect_all_ots_from_node(c, acc);
            }
        }
        OCPTNode::Leaf(leaf) => {
            for s in &leaf.related_ob_types {
                acc.insert(s.clone());
            }
            for s in &leaf.divergent_ob_types {
                acc.insert(s.clone());
            }
            for s in &leaf.convergent_ob_types {
                acc.insert(s.clone());
            }
            for s in &leaf.deficient_ob_types {
                acc.insert(s.clone());
            }
        }
    }
}


#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_convert_and_store_ocpt_123_roundtrip() {
        use tokio::fs;
        use crate::core::struct_converters::ocpt_frontend_backend::{frontend_to_backend, backend_to_frontend};
        use crate::models::ocpt::{OcptFE,OCPT};

        // Hard-coded file path in ./temp
        let path = "./temp/ocpt_123.json";

        // Read file content
        let content = fs::read_to_string(path)
            .await
            .expect("❌ failed to read ./temp/ocpt_123.json");

        // Try to parse as frontend struct first
        if let Ok(fe_struct) = serde_json::from_str::<OcptFE>(&content) {
            println!("📥 Parsed as frontend OCPT, converting to backend...");

            // Convert frontend → backend
            let ocpt_backend = frontend_to_backend(fe_struct)
                .expect("❌ frontend→backend conversion failed");
            assert!(ocpt_backend.is_valid(), "frontend OCPT should yield valid backend OCPT");

            // Store converted backend
            let out_backend = "./temp/ocpt_123_backend.json";
            let pretty_backend = serde_json::to_string_pretty(&ocpt_backend).unwrap();
            fs::write(out_backend, pretty_backend)
                .await
                .expect("❌ failed to write backend OCPT");
            println!("✅ Stored converted backend at {out_backend}");

            // Convert backend → frontend
            let ocpt_frontend = backend_to_frontend(&ocpt_backend);

            // Store converted frontend
            let out_frontend = "./temp/ocpt_123_frontend.json";
            let pretty_frontend = serde_json::to_string_pretty(&ocpt_frontend).unwrap();
            fs::write(out_frontend, pretty_frontend)
                .await
                .expect("❌ failed to write frontend OCPT");
            println!("✅ Stored roundtrip frontend at {out_frontend}");
        }
        // Otherwise try backend struct directly
        else if let Ok(be_struct) = serde_json::from_str::<OCPT>(&content) {
            println!("📥 Parsed as backend OCPT directly, no conversion needed");
            assert!(be_struct.is_valid(), "backend OCPT should already be valid");

            // Store normalized backend copy
            let out_backend = "./temp/ocpt_123_backend.json";
            let pretty_backend = serde_json::to_string_pretty(&be_struct).unwrap();
            fs::write(out_backend, pretty_backend)
                .await
                .expect("❌ failed to write backend OCPT");
            println!("✅ Stored backend copy at {out_backend}");

            // Convert backend → frontend
            let ocpt_frontend = backend_to_frontend(&be_struct);

            // Store converted frontend
            let out_frontend = "./temp/ocpt_123_frontend.json";
            let pretty_frontend = serde_json::to_string_pretty(&ocpt_frontend).unwrap();
            fs::write(out_frontend, pretty_frontend)
                .await
                .expect("❌ failed to write frontend OCPT");
            println!("✅ Stored converted frontend at {out_frontend}");
        } else {
            panic!("❌ ocpt_123.json is neither valid frontend nor backend OCPT JSON");
        }
    }
}