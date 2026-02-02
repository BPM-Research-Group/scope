use crate::core::ocim::common_data::{GlobalData, LocalData};
use crate::models::ocpt::{OCPTLeaf, OCPTNode, OCPTOperator, OCPTOperatorType};
use rustc_hash::{FxHashMap, FxHashSet};

pub fn basecase(local_data: LocalData, global_data: &GlobalData) -> OCPTNode {
    // only call if local_data.alphabet.len() == 1

    let activity = &local_data.alphabet[0];

    let empty_set = FxHashSet::default();
    let related_ots = global_data.related.get(activity).unwrap_or(&empty_set);

    // Step 1: Calculate `sizes`
    let sizes: FxHashMap<String, bool> = related_ots
        .iter()
        .map(|ot| {
            let has_multi_event_obj = local_data.oc_log_list.iter().any(|log| {
                let mut oid_event_counts: FxHashMap<String, usize> = FxHashMap::default();

                let oids_of_type_ot: FxHashSet<String> = log
                    .objects
                    .iter()
                    .filter(|obj| &obj.object_type == ot)
                    .map(|obj| obj.id.clone())
                    .collect();

                if oids_of_type_ot.is_empty() {
                    return false;
                }

                for event in &log.events {
                    for rel in &event.relationships {
                        let oid = &rel.object_id;
                        if oids_of_type_ot.contains(oid) {
                            *oid_event_counts.entry(oid.clone()).or_default() += 1;
                        }
                    }
                }
                oid_event_counts.values().any(|&count| count > 1)
            });
            (ot.clone(), has_multi_event_obj)
        })
        .collect();

    // Step 2 & 3: Identify and filter `loops`
    let divergence_for_activity = global_data
        .divergence
        .get(activity)
        .unwrap_or(&empty_set);

    let loops: FxHashSet<String> = related_ots
        .iter()
        .filter(|ot| *sizes.get(*ot).unwrap_or(&false))
        .filter(|ot| !divergence_for_activity.contains(*ot))
        .cloned()
        .collect();

    // Step 4: Return model
    if !loops.is_empty() {
        let mut op = OCPTOperator::new(OCPTOperatorType::Loop(None));

        let mut leaf1 = OCPTLeaf::new(Some(activity.clone()));
        leaf1.related_ob_types = related_ots.iter().cloned().collect();
        leaf1.divergent_ob_types = divergence_for_activity.iter().cloned().collect();
        leaf1.convergent_ob_types = global_data
            .convergence
            .get(activity)
            .unwrap_or(&empty_set)
            .iter()
            .cloned()
            .collect();
        leaf1.deficient_ob_types = global_data
            .deficiency
            .get(activity)
            .unwrap_or(&empty_set)
            .iter()
            .cloned()
            .collect();
        op.children.push(OCPTNode::Leaf(leaf1));

        let mut leaf2 = OCPTLeaf::new(None); // Tau leaf
        leaf2.related_ob_types = local_data.object_types.iter().cloned().collect();
        leaf2.divergent_ob_types = local_data.object_types.iter().cloned().collect();
        leaf2.convergent_ob_types = local_data.object_types.iter().cloned().collect();
        leaf2.deficient_ob_types = local_data.object_types.iter().cloned().collect();
        op.children.push(OCPTNode::Leaf(leaf2));

        OCPTNode::Operator(op)
    } else {
        let mut leaf = OCPTLeaf::new(Some(activity.clone()));
        leaf.related_ob_types = related_ots.iter().cloned().collect();
        leaf.divergent_ob_types = divergence_for_activity.iter().cloned().collect();
        leaf.convergent_ob_types = global_data
            .convergence
            .get(activity)
            .unwrap_or(&empty_set)
            .iter()
            .cloned()
            .collect();
        leaf.deficient_ob_types = global_data
            .deficiency
            .get(activity)
            .unwrap_or(&empty_set)
            .iter()
            .cloned()
            .collect();

        OCPTNode::Leaf(leaf)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::ocim::algorithm::ocim_init;
    use crate::models::ocpt::{OCPTLeafLabel, OCPTOperatorType};
    use chrono::Utc;
    use process_mining::ocel::ocel_struct::{
        OCEL, OCELEvent, OCELObject, OCELRelationship, OCELType,
    };
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
    fn test_base_case_no_loop() {
        // 1. Setup: Create an OCEL for a simple base case (one event for one object)
        let mut ocel = new_empty_ocel();
        let obj1 = OCELObject {
            id: "o1".to_string(),
            object_type: "ot1".to_string(),
            attributes: Vec::new(),
            relationships: Vec::new(),
        };
        ocel.objects.push(obj1);

        let event1 = OCELEvent {
            id: "e1".to_string(),
            event_type: "a".to_string(),
            time: Utc::now().into(),
            attributes: Vec::new(),
            relationships: vec![OCELRelationship {
                object_id: "o1".to_string(),
                qualifier: "rel".to_string(),
            }],
        };
        ocel.events.push(event1);
        ocel.event_types.push(OCELType { name: "a".to_string(), attributes: Vec::new() });
        ocel.object_types.push(OCELType { name: "ot1".to_string(), attributes: Vec::new() });

        // 2. Act: Run the OCIM algorithm
        let ocpt = ocim_init(&vec![ocel.clone()]);
        dbg!(&ocpt);

        // 3. Assert: Check if the result is a single LeafNode
        if let OCPTNode::Leaf(leaf) = ocpt.root {
            if let OCPTLeafLabel::Activity(activity) = &leaf.activity_label {
                assert_eq!(activity, "a");
            } else {
                panic!("Expected activity leaf, found Tau leaf");
            }
        } else {
            panic!("Expected a LeafNode, but found an OperatorNode");
        }
    }

    #[test]
    fn test_base_case_with_loop() {
        // 1. Setup: Create an OCEL where one object has two events of the same type.
        let mut ocel = new_empty_ocel();
        let obj1 = OCELObject {
            id: "o1".to_string(),
            object_type: "ot1".to_string(),
            attributes: Vec::new(),
            relationships: Vec::new(),
        };
        ocel.objects.push(obj1);

        let event1 = OCELEvent {
            id: "e1".to_string(),
            event_type: "a".to_string(),
            time: Utc::now().into(),
            attributes: Vec::new(),
            relationships: vec![OCELRelationship {
                object_id: "o1".to_string(),
                qualifier: "rel".to_string(),
            }],
        };
        
        thread::sleep(Duration::from_millis(10)); // Ensure different timestamps

        let event2 = OCELEvent {
            id: "e2".to_string(),
            event_type: "a".to_string(),
            time: Utc::now().into(),
            attributes: Vec::new(),
            relationships: vec![OCELRelationship {
                object_id: "o1".to_string(),
                qualifier: "rel".to_string(),
            }],
        };
        ocel.events.push(event1);
        ocel.events.push(event2);
        ocel.event_types.push(OCELType { name: "a".to_string(), attributes: Vec::new() });
        ocel.object_types.push(OCELType { name: "ot1".to_string(), attributes: Vec::new() });

        // 2. Act: Run the OCIM algorithm
        let ocpt = ocim_init(&vec![ocel.clone()]);
        dbg!(&ocpt);

        // 3. Assert: Check if the result is a Loop OperatorNode
        if let OCPTNode::Operator(op) = ocpt.root {
            assert!(matches!(op.operator_type, OCPTOperatorType::Loop(_)));
            assert_eq!(op.children.len(), 2);
        } else {
            panic!("Expected a Loop OperatorNode, but found a LeafNode");
        }
    }

    #[test]
    fn test_not_a_base_case() {
        // 1. Setup: Create an OCEL with more than one activity type.
        let mut ocel = new_empty_ocel();
        let event1 = OCELEvent {
            id: "e1".to_string(),
            event_type: "a".to_string(),
            time: Utc::now().into(),
            attributes: Vec::new(),
            relationships: vec![],
        };
        let event2 = OCELEvent {
            id: "e2".to_string(),
            event_type: "b".to_string(),
            time: Utc::now().into(),
            attributes: Vec::new(),
            relationships: vec![],
        };
        ocel.events.push(event1);
        ocel.events.push(event2);
        ocel.event_types.push(OCELType { name: "a".to_string(), attributes: Vec::new() });
        ocel.event_types.push(OCELType { name: "b".to_string(), attributes: Vec::new() });

        // 2. Act: Run the OCIM algorithm
        let ocpt = ocim_init(&vec![ocel.clone()]);
        dbg!(&ocpt);

        // 3. Assert: Check that `basecase` was not called and we have a placeholder from the stubbed cut logic.
        // This assertion depends on the stub implementation in `algorithm.rs`.
        if let OCPTNode::Leaf(leaf) = ocpt.root {
            if let OCPTLeafLabel::Activity(activity) = &leaf.activity_label {
                assert_eq!(activity, "NO_CUT_FOUND");
            } else {
                panic!("Expected activity leaf, found Tau leaf");
            }
        } else {
            panic!("Expected a LeafNode for 'NO_CUT_FOUND', but found an OperatorNode");
        }
    }
}
