use crate::core::ocim::auxiliary_methods::get_divergent_types;
use crate::core::ocim::common_data::{GlobalData, LocalData};
use crate::models::ocel::OCEL;
use crate::models::ocpt::OCPTOperatorType;
use petgraph::unionfind::UnionFind;
use rustc_hash::{FxHashMap, FxHashSet};

pub fn split_log(
    local_data: &LocalData,
    partition: Vec<Vec<String>>,
    operator: &OCPTOperatorType,
    global_data: &GlobalData,
) -> Vec<LocalData> {
    match operator {
        OCPTOperatorType::Sequence | OCPTOperatorType::Concurrency => {
            let result: Vec<LocalData> = partition
                .into_iter()
                .filter(|part| !part.is_empty())
                .map(|part| {
                    let part_activities: FxHashSet<String> = part.iter().cloned().collect();

                    let new_oc_log_list: Vec<OCEL> = local_data
                        .oc_log_list
                        .iter()
                        .map(|log| {
                            let mut new_log = log.clone();

                            // Filter events based on the partition
                            new_log
                                .events
                                .retain(|event| part_activities.contains(&event.event_type));

                            // --- OCEL Consistency Cleanup ---
                            let used_event_types: FxHashSet<String> = new_log
                                .events
                                .iter()
                                .map(|e| e.event_type.clone())
                                .collect();
                            new_log
                                .event_types
                                .retain(|et| used_event_types.contains(&et.name));

                            let used_object_ids: FxHashSet<String> = new_log
                                .events
                                .iter()
                                .flat_map(|event| &event.relationships)
                                .map(|rel| rel.object_id.clone())
                                .collect();
                            new_log
                                .objects
                                .retain(|obj| used_object_ids.contains(&obj.id));

                            let used_object_types: FxHashSet<String> = new_log
                                .objects
                                .iter()
                                .map(|o| o.object_type.clone())
                                .collect();
                            new_log
                                .object_types
                                .retain(|ot| used_object_types.contains(&ot.name));

                            new_log
                        })
                        .collect();

                    LocalData::new(new_oc_log_list, Some(local_data.expected_objects.clone()))
                })
                .collect();
            return result;
        }
        OCPTOperatorType::ExclusiveChoice => {
            let result: Vec<LocalData> = partition
                .into_iter()
                .filter(|part| !part.is_empty())
                .map(|part| {
                    let part_activities: FxHashSet<String> = part.iter().cloned().collect();

                    let new_oc_log_list: Vec<OCEL> = local_data
                        .oc_log_list
                        .iter()
                        .map(|log| {
                            let mut new_log = log.clone();

                            // Filter events based on the partition
                            new_log
                                .events
                                .retain(|event| part_activities.contains(&event.event_type));

                            // --- OCEL Consistency Cleanup ---
                            let used_event_types: FxHashSet<String> = new_log
                                .events
                                .iter()
                                .map(|e| e.event_type.clone())
                                .collect();
                            new_log
                                .event_types
                                .retain(|et| used_event_types.contains(&et.name));

                            let used_object_ids: FxHashSet<String> = new_log
                                .events
                                .iter()
                                .flat_map(|event| &event.relationships)
                                .map(|rel| rel.object_id.clone())
                                .collect();
                            new_log
                                .objects
                                .retain(|obj| used_object_ids.contains(&obj.id));

                            let used_object_types: FxHashSet<String> = new_log
                                .objects
                                .iter()
                                .map(|o| o.object_type.clone())
                                .collect();
                            new_log
                                .object_types
                                .retain(|ot| used_object_types.contains(&ot.name));

                            new_log
                        })
                        .collect();

                    let new_expected_objects: FxHashSet<String> = new_oc_log_list
                        .iter()
                        .flat_map(|log| &log.events)
                        .flat_map(|event| &event.relationships)
                        .map(|rel| rel.object_id.clone())
                        .collect();

                    LocalData::new(new_oc_log_list, Some(new_expected_objects))
                })
                .collect();
            return result;
        }
        OCPTOperatorType::Loop(_repetitions) => {
            // BEWARE: THIS AI GENERATED CODE THAT NEEDS REVIEW AND TESTING BEFORE USE

            let mut result_sublogs: Vec<Vec<OCEL>> = vec![Vec::new(); partition.len()];

            for log in &local_data.oc_log_list {
                if log.events.is_empty() {
                    continue;
                }
                // 1. Build lookups
                let object_id_to_type: FxHashMap<String, String> =
                    log.objects.iter().map(|o| (o.id.clone(), o.object_type.clone())).collect();

                let mut object_id_to_events: FxHashMap<String, Vec<&_>> = FxHashMap::default();
                for event in &log.events {
                    for rel in &event.relationships {
                        object_id_to_events.entry(rel.object_id.clone()).or_default().push(event);
                    }
                }
                
                let event_ids: Vec<&str> = log.events.iter().map(|e| e.id.as_str()).collect();
                let event_id_to_idx: FxHashMap<&str, usize> =
                    event_ids.iter().enumerate().map(|(i, &id)| (id, i)).collect();
                
                let mut uf = UnionFind::new(event_ids.len());

                for (oid, otype) in &object_id_to_type {
                    if let Some(mut obj_events) = object_id_to_events.get(oid).cloned() {
                        obj_events.sort_by_key(|e| e.time);

                        for i in 0..(obj_events.len().saturating_sub(1)) {
                            let e1 = obj_events[i];
                            let e2 = obj_events[i + 1];

                            let in_do1 = partition[0].contains(&e1.event_type);
                            let in_do2 = partition[0].contains(&e2.event_type);

                            if in_do1 != in_do2 {
                                continue;
                            }

                            if let Some((_, start_counts, end_counts)) = local_data.dfgs.get(otype) {
                                if start_counts.get(&e2.event_type).is_some()
                                    && end_counts.get(&e1.event_type).is_some()
                                {
                                    continue;
                                }
                            }

                            let divergent_types = get_divergent_types(
                                &e1.event_type,
                                &e2.event_type,
                                &local_data.alphabet,
                                global_data,
                            );
                            if divergent_types.contains(otype) {
                                continue;
                            }
                            
                            let idx1 = event_id_to_idx[e1.id.as_str()];
                            let idx2 = event_id_to_idx[e2.id.as_str()];
                            uf.union(idx1, idx2);
                        }
                    }
                }

                let labels = (0..event_ids.len()).map(|i| uf.find(i)).collect::<Vec<_>>();
                let n_components = labels.iter().cloned().max().map_or(0, |x| x + 1);

                let separation: Vec<Vec<&str>> = (0..n_components)
                    .map(|n| {
                        labels
                            .iter()
                            .enumerate()
                            .filter(|&(_, &label)| label == n)
                            .map(|(i, _)| event_ids[i])
                            .collect()
                    })
                    .collect();

                let sublogs: Vec<OCEL> = separation
                    .iter()
                    .map(|event_id_group| {
                        let mut new_log = log.clone();
                        new_log.events.retain(|e| event_id_group.contains(&e.id.as_str()));
                        
                        let used_event_types: FxHashSet<String> = new_log.events.iter().map(|e| e.event_type.clone()).collect();
                        new_log.event_types.retain(|et| used_event_types.contains(&et.name));
                        let used_object_ids: FxHashSet<String> = new_log.events.iter().flat_map(|event| &event.relationships).map(|rel| rel.object_id.clone()).collect();
                        new_log.objects.retain(|obj| used_object_ids.contains(&obj.id));
                        let used_object_types: FxHashSet<String> = new_log.objects.iter().map(|o| o.object_type.clone()).collect();
                        new_log.object_types.retain(|ot| used_object_types.contains(&ot.name));
                        new_log
                    })
                    .collect();
                
                for sublog in sublogs {
                    if sublog.events.is_empty() { continue; }
                    let unique_activities: FxHashSet<String> = sublog.event_types.iter().map(|et| et.name.clone()).collect();
                    for i in 0..partition.len() {
                        if partition[i].iter().any(|p_act| unique_activities.contains(p_act)) {
                            result_sublogs[i].push(sublog.clone());
                            break; 
                        }
                    }
                }
            }

            return result_sublogs
                .into_iter()
                .filter(|log_list| !log_list.is_empty())
                .map(|oc_log_list| {
                    LocalData::new(
                        oc_log_list,
                        Some(local_data.expected_objects.clone()),
                    )
                })
                .collect();
        }
    }
}