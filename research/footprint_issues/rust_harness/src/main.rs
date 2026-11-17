//! Runs rust4pm's footprint conformance on one case directory.
//! Usage: footprint_harness <case_dir>  (reads log.json = OCEL 2.0 JSON, tree_rust.json = serde OCPT)
//! Writes <case_dir>/out_rust4pm.json.
use process_mining::conformance::object_centric::footprint_based_ocpt::compute_footprint_conformance_abstractions;
use process_mining::conformance::object_centric::object_centric_language_abstraction::OCLanguageAbstraction;
use process_mining::core::event_data::object_centric::linked_ocel::IndexLinkedOCEL;
use process_mining::core::event_data::object_centric::ocel_json::import_ocel_json_path;
use process_mining::core::process_models::object_centric::ocpt::OCPT;
use serde_json::json;
use std::path::PathBuf;

fn main() {
    let dir = PathBuf::from(std::env::args().nth(1).expect("case dir"));
    let ocel = import_ocel_json_path(dir.join("log.json")).expect("log.json");
    let locel = IndexLinkedOCEL::from_ocel(ocel);
    let tree: OCPT = serde_json::from_str(&std::fs::read_to_string(dir.join("tree_rust.json")).unwrap()).expect("tree_rust.json");
    let log_abs = OCLanguageAbstraction::create_from_ocel(&locel);
    let tree_abs = OCLanguageAbstraction::create_from_oc_process_tree(&tree);
    let c = compute_footprint_conformance_abstractions(&log_abs, &tree_abs);
    let out = json!({
        "tree_valid": tree.is_valid(),
        "log": log_abs,
        "tree": tree_abs,
        "conformance": {
            "fitness": [c.control_fitness, c.multiplicity_fitness, c.identity_fitness],
            "precision": [c.control_precision, c.multiplicity_precision, c.identity_precision],
            "overall": [c.overall_fitness, c.overall_precision],
        }
    });
    std::fs::write(dir.join("out_rust4pm.json"), serde_json::to_string_pretty(&out).unwrap()).unwrap();
}
