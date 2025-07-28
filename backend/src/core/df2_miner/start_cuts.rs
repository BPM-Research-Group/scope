use std::collections::{HashMap, HashSet};
use crate::models::ocpt::{TreeNode, ProcessForest};
use itertools::Itertools;
use log::info;

pub fn find_cuts(
    dfg: &HashMap<(String, String), usize>,
    filtered_dfg: &HashMap<(String, String), usize>,
    all_activities: HashSet<String>,
    start_activities: &HashSet<String>,
    end_activities: &HashSet<String>
) -> ProcessForest {
    let mut forest = Vec::new();

    let activities: Vec<String> = all_activities.clone().into_iter().collect();
    let n = activities.len();

    if n == 1 {
        // Base case: single activity, create a leaf node
        let node = TreeNode {
            label: activities[0].clone(),
            children: Vec::new(),
        };
        forest.push(node);
        return forest;
    }

    for i in 1..n {
        for combo in activities.iter().combinations(i) {
            let combo_set: HashSet<String> = combo.into_iter().cloned().collect();
            let complement_set: HashSet<String> = all_activities
                .difference(&combo_set)
                .cloned()
                .collect();

            let combined_activites: HashSet<String> = combo_set.union(&complement_set).cloned().collect();
            let filtered_dfg = filter_keep_dfg(&dfg, &combined_activites);

            let (filtered_start_activites,filtered_end_activites)=get_start_and_end_activities_v2(&dfg, &combined_activites, start_activities, end_activities);
            
            // info!("Checking cut: {:?} (.....) {:?}", combo_set, complement_set);

            let excl_cut = is_exclusive_choice_cut_possible(&filtered_dfg, &combo_set, &complement_set);
            if excl_cut {
                info!("Excl parallel cut found: {:?} (X) {:?}", combo_set, complement_set);
                let mut node = TreeNode {
                    label: "excl".to_string(),
                    children: Vec::new(),
                };
                node.children.extend(find_cuts(&dfg, &filtered_dfg, combo_set, &start_activities, &end_activities));
                node.children.extend(find_cuts(&dfg, &filtered_dfg, complement_set, &start_activities, &end_activities));
                forest.push(node);
                return forest; // Return early if you only want the first valid cut
            }

            let seq_cut = is_sequence_cut_possible(&filtered_dfg, &combo_set, &complement_set);
            if seq_cut {
                info!("Seq parallel cut found: {:?} (->) {:?}", combo_set, complement_set);
                let mut node = TreeNode {
                    label: "seq".to_string(),
                    children: Vec::new(),
                };
                node.children.extend(find_cuts(&dfg, &filtered_dfg, combo_set, &start_activities, &end_activities));
                node.children.extend(find_cuts(&dfg, &filtered_dfg, complement_set, &start_activities, &end_activities));
                forest.push(node);
                return forest; // Return early if you only want the first valid cut
            }

            let para_cut = is_parallel_cut_possible(&filtered_dfg, &combo_set, &complement_set, &filtered_start_activites, &filtered_end_activites);
            if para_cut {
                info!("Parallel cut found: {:?} (||) {:?}", combo_set, complement_set);
                let mut node = TreeNode {
                    label: "para".to_string(),
                    children: Vec::new(),
                };
                node.children.extend(find_cuts(&dfg, &filtered_dfg, combo_set, &start_activities, &end_activities));
                node.children.extend(find_cuts(&dfg, &filtered_dfg, complement_set, &start_activities, &end_activities));
                forest.push(node);
                return forest; // Return early if you only want the first valid cut
            }

            let redo_cut = is_redo_cut_possible(&filtered_dfg, &combo_set, &complement_set, &filtered_start_activites, &filtered_end_activites);
            if redo_cut {
                info!("Redo cut found: {:?} (O->) {:?}", combo_set, complement_set);
                let mut node = TreeNode {
                    label: "redo".to_string(),
                    children: Vec::new(),
                };
                node.children.extend(find_cuts(&dfg, &filtered_dfg, combo_set, &start_activities, &end_activities));
                node.children.extend(find_cuts(&dfg, &filtered_dfg, complement_set, &start_activities, &end_activities));
                forest.push(node);
                return forest; // Return early if you only want the first valid cut
            }
        }
    }

    // If no valid cuts are found, return disjoint trees
    for activity in activities {
        let node = TreeNode {
            label: activity,
            children: Vec::new(),
        };
        forest.push(node);
    }

    forest
}

pub fn is_reachable(
    dfg: &HashMap<(String, String), usize>,
    activity1: &str,
    activity2: &str,
) -> bool {

    let mut visited = HashSet::new();
    let mut stack = vec![activity1.to_string()];

    while let Some(current) = stack.pop() {
        if current == activity2 {
            return true;
        }

        if visited.insert(current.clone()) {
            for ((from, to), _) in dfg {
                if from == &current {
                    stack.push(to.clone());
                }
            }
        }
    }

    false
}

fn filter_keep_dfg(
    dfg: &HashMap<(String, String), usize>,
    keep_list: &HashSet<String>,
) -> HashMap<(String, String), usize> {
    dfg.iter()
        .filter(|((from, to), _)| {
            keep_list.contains(from) && keep_list.contains(to)
        })
        .map(|(k, v)| (k.clone(), *v))
        .collect()
}


fn is_sequence_cut_possible(
    dfg: &HashMap<(String, String), usize>,
    set_1_activities: &HashSet<String>,
    set_2_activities: &HashSet<String>,
) -> bool {
    // Check if every activity in set_2 is reachable from every activity in set_1
    for act1 in set_1_activities {
        for act2 in set_2_activities {
            if !is_reachable(dfg, act1, act2) {
                return false;
            }
        }
    }

    // Ensure no activity in set_1 is reachable from any activity in set_2
    for act2 in set_2_activities {
        for act1 in set_1_activities {
            
            if is_reachable(dfg, act2, act1) {
                return false;
            }

        }
    }
    true
}

fn is_exclusive_choice_cut_possible(
    dfg: &HashMap<(String, String), usize>,
    set_1_activities: &HashSet<String>,
    set_2_activities: &HashSet<String>,
) -> bool {
    for act1 in set_1_activities {
        for act2 in set_2_activities {
            if dfg.contains_key(&(act1.clone(), act2.clone())) || dfg.contains_key(&(act2.clone(), act1.clone())) {
                return false;
            }
        }
    }
    true
}

fn is_parallel_cut_possible(
    dfg: &HashMap<(String, String), usize>,
    set_1_activities: &HashSet<String>,
    set_2_activities: &HashSet<String>,
    start_activities: &HashSet<String>,
    end_activities: &HashSet<String>,
) -> bool {
    info!("Checking parallel cut...");
    info!("Start activities: {:?}", start_activities);
    info!("End activities: {:?}", end_activities);

    // 1. There must be some common activities between set_1_activities and start_activities
    if set_1_activities.is_disjoint(start_activities) {
        return false;
    }

    // 2. There must be some common activities between set_1_activities and end_activities
    if set_1_activities.is_disjoint(end_activities) {
        return false;
    }

    // 3. There must be some common activities between set_2_activities and start_activities
    if set_2_activities.is_disjoint(start_activities) {
        return false;
    }

    // 4. There must be some common activities between set_2_activities and end_activities
    if set_2_activities.is_disjoint(end_activities) {
        return false;
    }

    // 5. ∀ a ∈ set_1, ∀ b ∈ set_2: (a, b) ∈ dfg ∧ (b, a) ∈ dfg
    for a in set_1_activities {
        for b in set_2_activities {
            if !dfg.contains_key(&(a.clone(), b.clone())) || !dfg.contains_key(&(b.clone(), a.clone())) {
                return false;
            }
        }
    }

    true
}

fn is_redo_cut_possible(
    dfg: &HashMap<(String, String), usize>,
    set_1_activities: &HashSet<String>,
    set_2_activities: &HashSet<String>,
    start_activities: &HashSet<String>,
    end_activities: &HashSet<String>,
) -> bool {

    // info!("Checking redo...");
    // Condition 1: ignore for now as n==2

    // Condition 2: All start and end activities must be in set_1_activities
    if !start_activities.is_subset(set_1_activities) || !end_activities.is_subset(set_1_activities) {
        return false;
    }
    // info!("Condition 1 and 2 passed...");
    // Condition 3: There exists an (a ∈ end_activities, b ∈ set_2_activities) such that (a, b) ∈ dfg
    let mut condition2_met = false;
    // info!("End activities: {:?}", end_activities);
    // info!("Set 2 activities: {:?}", set_2_activities);
    // info!("DFG: {:?}", dfg);
    for a in end_activities {
        for b in set_2_activities {
            if dfg.contains_key(&(a.clone(), b.clone())) {
                // info!("Condition 3 met for {} -> {}", a, b);
                condition2_met = true;
                break;
            }
        }
        if condition2_met {
            break;
        }
    }
    if !condition2_met {
        return false;
    }

    // info!("Condition 3 passed...");

    // Condition 4: There exists an (a ∈ start_activities, b ∈ set_2_activities) such that (b, a) ∈ dfg
    let mut condition3_met = false;
    for a in start_activities {
        for b in set_2_activities {
            if dfg.contains_key(&(b.clone(), a.clone())) {
                condition3_met = true;
                break;
            }
        }
        if condition3_met {
            break;
        }
    }
    if !condition3_met {
        return false;
    }

    // info!("Condition 4 passed...");

    // Condition 5: since we are only considering 2 sets of activities, we can skip this condition.

    // Condition 6: For every a ∈ end_activities, there exists a b ∈ set_2_activities such that (a, b) ∈ dfg
    for a in end_activities {
        let mut found = false;
        for b in set_2_activities {
            if dfg.contains_key(&(a.clone(), b.clone())) {
                found = true;
                break;
            }
        }
        if !found {
            return false;
        }
    }

    // info!("Condition 5 and 6 passed...");

    // Condition 7: For every a ∈ start_activities, there exists a b ∈ set_2_activities such that (b, a) ∈ dfg
    for a in start_activities {
        let mut found = false;
        for b in set_2_activities {
            if dfg.contains_key(&(b.clone(), a.clone())) {
                found = true;
                break;
            }
        }
        if !found {
            return false;
        }
    }

    // info!("Condition 7 passed...");

    true
}


fn get_start_and_end_activities(
    dfg: &HashMap<(String, String), usize>,
    filtered_activities: &HashSet<String>,
) -> (HashSet<String>, HashSet<String>) {
    let mut start_activities = HashSet::new();
    let mut end_activities = HashSet::new();

    // info!("Getting start and end activities based on filtered set...");

    for ((from, to), _) in dfg {
        let from_in = filtered_activities.contains(from);
        let to_in = filtered_activities.contains(to);

        if to_in && !from_in {
            // 'to' is inside filtered, 'from' is outside → 'to' is a start activity
            start_activities.insert(to.clone());
        }

        if from_in && !to_in {
            // 'from' is inside filtered, 'to' is outside → 'from' is an end activity
            end_activities.insert(from.clone());
        }
    }

    // info!("Start activities: {:?}", start_activities);
    // info!("End activities: {:?}", end_activities);

    (start_activities, end_activities)
}

fn get_start_and_end_activities_v2(
    dfg: &HashMap<(String, String), usize>,
    filtered_activities: &HashSet<String>,
    global_start_activities: &HashSet<String>,
    global_end_activities: &HashSet<String>,
) -> (HashSet<String>, HashSet<String>) {
    let mut start_activities = HashSet::new();
    let mut end_activities = HashSet::new();

    for ((a, b), _) in dfg {
        let a_in = filtered_activities.contains(a);
        let b_in = filtered_activities.contains(b);

        if !a_in && b_in {
            // 'a' is outside and 'b' is inside → 'b' is a start activity
            start_activities.insert(b.clone());
        }

        if a_in && !b_in {
            // 'a' is inside and 'b' is outside → 'a' is an end activity
            end_activities.insert(a.clone());
        }
    }

    // Add common activities from global sets
    for activity in filtered_activities {
        if global_start_activities.contains(activity) {
            start_activities.insert(activity.clone());
        }
        if global_end_activities.contains(activity) {
            end_activities.insert(activity.clone());
        }
    }

    (start_activities, end_activities)
}








