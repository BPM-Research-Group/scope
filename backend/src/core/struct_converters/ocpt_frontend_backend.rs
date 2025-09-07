use anyhow::{anyhow, Result};
use std::collections::{HashMap, HashSet};

use crate::models::ocpt::{Ocpt, HierarchyNode, ActivityValue, ObjectType as FeObjectType};
use crate::models::ocpt2::{
    OCPT, OCPTLeaf, OCPTLeafLabel, OCPTNode, OCPTOperator, OCPTOperatorType,
};

/* ========================= Public API ========================= */

/// Frontend → Backend
pub fn frontend_to_backend(front: Ocpt) -> Result<OCPT> {
    let root = frontend_node_to_backend(&front.hierarchy)?;
    Ok(OCPT::new(root))
}

/// Backend → Frontend
pub fn backend_to_frontend(ocpt: &OCPT) -> Ocpt {
    // Collect all object types appearing in any leaf (related OR marked)
    let mut all_ots: HashSet<String> = HashSet::new();
    collect_all_ots_from_node(&ocpt.root, &mut all_ots);

    let mut ots_vec: Vec<String> = all_ots.into_iter().collect();
    ots_vec.sort();

    let hierarchy = backend_node_to_frontend(&ocpt.root);

    Ocpt {
        ots: ots_vec,
        hierarchy,
    }
}

/* ========================= Frontend → Backend helpers ========================= */

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

fn stringify_operator(op: &OCPTOperatorType) -> String {
    match op {
        OCPTOperatorType::Sequence => "sequence".to_string(),
        OCPTOperatorType::ExclusiveChoice => "exclusiveChoice".to_string(),
        OCPTOperatorType::Concurrency => "parallel".to_string(),
        OCPTOperatorType::Loop(_cnt) => "loop".to_string(), // ignore parameter in FE
    }
}

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
    use std::{path::Path, time::Duration};

    use tokio::fs;
    use tokio::time::sleep;

    use serde_json::json;

    use crate::core::struct_converters::ocpt_frontend_backend::{frontend_to_backend, backend_to_frontend};
    use crate::models::ocpt::{Ocpt, HierarchyNode, ActivityValue, ObjectType as FeObjectType};
    use crate::models::ocpt2::{OCPT, OCPTLeaf, OCPTNode, OCPTOperator, OCPTOperatorType};

    const TEMP_DIR: &str = "./temp";

    async fn ensure_temp_dir() {
        if !Path::new(TEMP_DIR).exists() {
            fs::create_dir_all(TEMP_DIR).await.expect("create ./temp");
            // slight pause for flaky FS on some CI systems
            sleep(Duration::from_millis(10)).await;
        }
    }

    /// Write a pretty JSON file to ./temp and return its path.
    async fn write_json_to_temp(file_name: &str, value: serde_json::Value) -> String {
        ensure_temp_dir().await;
        let path = format!("{}/{}", TEMP_DIR, file_name);
        let pretty = serde_json::to_string_pretty(&value).expect("serialize json");
        fs::write(&path, pretty).await.expect("write json file");
        path
    }

    /// Read a file as string from ./temp
    async fn read_to_string(path: &str) -> String {
        fs::read_to_string(path).await.expect("read file")
    }

    #[tokio::test]
    async fn test_convert_frontend_file_to_backend() {
        // --- Arrange: create a small *frontend* OCPT JSON file in ./temp ---
        //
        // Frontend shape (untagged enum):
        // hierarchy: { value: "sequence", children: [ { value: { isSilent: false, activity: "...", ots: [...] } } ] }
        let fe_json = json!({
            "ots": ["Order", "Item"],
            "hierarchy": {
                "value": "sequence",
                "children": [
                    {
                        "value": {
                            "isSilent": false,
                            "activity": "Create Order",
                            "ots": [
                                { "ot": "Order" },
                                { "ot": "Item", "exhibits": ["divergent"] }
                            ]
                        }
                    }
                ]
            }
        });

        let path = write_json_to_temp("ocpt_frontend_sample.json", fe_json).await;

        // --- Act: read as Frontend Ocpt, convert to backend OCPT ---
        let content = read_to_string(&path).await;
        let fe_struct: Ocpt = serde_json::from_str(&content).expect("parse frontend Ocpt");

        let ocpt_backend: OCPT = frontend_to_backend(fe_struct).expect("convert FE->BE");

        // --- Assert: the produced backend OCPT is structurally valid ---
        assert!(ocpt_backend.is_valid(), "Converted OCPT should be valid");

        // Optionally, persist the normalized backend as proof/output
        let out_path = format!("{}/ocpt_backend_from_frontend.json", TEMP_DIR);
        let pretty = serde_json::to_string_pretty(&ocpt_backend).unwrap();
        fs::write(&out_path, pretty).await.expect("write backend file");
    }

    #[tokio::test]
    async fn test_roundtrip_backend_frontend_backend() {
        // --- Arrange: build a tiny backend OCPT in memory ---
        // OCPT = Sequence(Create Order, Tau)
        let mut seq = OCPTOperator::new(OCPTOperatorType::Sequence);
        let leaf_create = OCPTLeaf::new(Some("Create Order".to_string()));
        let leaf_tau = OCPTLeaf::new(None);

        let mut node = OCPTNode::Operator(seq);
        if let OCPTNode::Operator(ref mut op) = node {
            op.children.push(OCPTNode::Leaf(leaf_create));
            op.children.push(OCPTNode::Leaf(leaf_tau));
        }
        let ocpt_original = OCPT::new(node);
        assert!(ocpt_original.is_valid(), "original constructed OCPT must be valid");

        // Save to ./temp (as if it were a stored backend file)
        ensure_temp_dir().await;
        let be_path = format!("{}/ocpt_backend_original.json", TEMP_DIR);
        fs::write(&be_path, serde_json::to_string_pretty(&ocpt_original).unwrap())
            .await
            .expect("write backend");

        // --- Act: load backend file → frontend → backend ---
        let be_content = read_to_string(&be_path).await;
        let be_loaded: OCPT = serde_json::from_str(&be_content).expect("parse backend OCPT");

        // Convert backend → frontend (for UI)
        let fe: Ocpt = backend_to_frontend(&be_loaded);

        // Quick sanity on FE: it should have a non-empty hierarchy
        // (more detailed checks possible if you'd like)
        match &fe.hierarchy {
            HierarchyNode::Operator { value, children } => {
                assert!(value.eq("sequence"), "operator value should be 'sequence'");
                assert!(!children.is_empty(), "sequence should have children");
            }
            _ => panic!("root should be an operator in FE"),
        }

        // Convert frontend → backend again (round-trip)
        let be_roundtrip = frontend_to_backend(fe).expect("convert FE->BE");

        // --- Assert: round-tripped backend is still valid ---
        assert!(be_roundtrip.is_valid(), "round-tripped OCPT should be valid");

        // Optional: check that the first leaf activity survived
        // (we don't assert full structural equality because UUIDs differ)
        // Convert back to FE and inspect the first activity name.
        let fe_again = backend_to_frontend(&be_roundtrip);
        let mut found_activity = false;
        if let HierarchyNode::Operator { children, .. } = &fe_again.hierarchy {
            for ch in children {
                if let HierarchyNode::Activity { value } = ch {
                    if !value.isSilent.unwrap_or(false) && value.activity == "Create Order" {
                        found_activity = true;
                        break;
                    }
                }
            }
        }
        assert!(found_activity, "expected to find 'Create Order' activity after round-trip");
    }
}

#[tokio::test]
async fn test_convert_hardcoded_ocpt_123() {
    // Hard-coded file path in ./temp
    let path = "./temp/ocpt_123.json";

    // Read file content
    let content = tokio::fs::read_to_string(path)
        .await
        .expect("failed to read ./temp/ocpt_123.json");

    // Try to parse as frontend struct first
    if let Ok(fe_struct) = serde_json::from_str::<crate::models::ocpt::Ocpt>(&content) {
        // Convert frontend → backend
        let ocpt_backend = frontend_to_backend(fe_struct)
            .expect("frontend→backend conversion failed");
        assert!(
            ocpt_backend.is_valid(),
            "frontend ocpt_123.json should yield valid backend OCPT"
        );
    }
    // Otherwise try backend struct directly
    else if let Ok(be_struct) = serde_json::from_str::<crate::models::ocpt2::OCPT>(&content) {
        assert!(
            be_struct.is_valid(),
            "backend ocpt_123.json should already be valid"
        );
    } else {
        panic!("ocpt_123.json is neither valid frontend nor backend OCPT JSON");
    }
}


#[tokio::test]
async fn test_convert_and_store_ocpt_123_roundtrip() {
    use tokio::fs;
    use crate::core::struct_converters::ocpt_frontend_backend::{frontend_to_backend, backend_to_frontend};
    use crate::models::ocpt::Ocpt;
    use crate::models::ocpt2::OCPT;

    // Hard-coded file path in ./temp
    let path = "./temp/ocpt_123.json";

    // Read file content
    let content = fs::read_to_string(path)
        .await
        .expect("❌ failed to read ./temp/ocpt_123.json");

    // Try to parse as frontend struct first
    if let Ok(fe_struct) = serde_json::from_str::<Ocpt>(&content) {
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
