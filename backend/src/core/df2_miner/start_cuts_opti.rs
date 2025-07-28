use crate::core::df2_miner::{start_cuts::is_reachable};
use crate::models::ocpt::{TreeNode, ProcessForest};
use log::info;
use std::collections::{HashMap, HashSet, VecDeque};
use crate::core::df2_miner::fallthrough_cuts::{self, FallthroughStrategy};

pub fn find_cuts_start(
    dfg: &HashMap<(String, String), usize>,
    all_activities: &HashSet<String>,
    start_activities: &HashSet<String>,
    end_activities: &HashSet<String>,
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

    let filtered_dfg = filter_keep_dfg(&dfg, &all_activities);
    let (start_activities, end_activities) =
        get_start_and_end_activities(&dfg, &all_activities, &start_activities, &end_activities);

    // ----- perform cuts--------

    info!("Attempting to find exclusive choice cut...");
    info!("All activities: {:?}", all_activities);
    info!("DFG edges: {:?}", dfg.keys().collect::<Vec<_>>());
    
    let (excl_set1, excl_set2) = find_exclusive_choice_cut(&filtered_dfg, &all_activities);
    info!("Found potential exclusive cut sets: set1={:?}, set2={:?}", excl_set1, excl_set2);
    
    if !excl_set1.is_empty() && !excl_set2.is_empty() {
        info!("Checking if sets are valid for exclusive cut...");
        // Check if there are any edges between the two sets in the directed graph
        let mut has_edges_between = false;
        let mut found_edges = Vec::new();
        
        for (from, to) in dfg.keys() {
            if (excl_set1.contains(from) && excl_set2.contains(to)) || 
               (excl_set2.contains(from) && excl_set1.contains(to)) {
                has_edges_between = true;
                found_edges.push((from.clone(), to.clone()));
            }
        }
        
        if !has_edges_between {
            info!("Exclusive cut valid - no edges between sets");
            info!("Exclusive cut found: {:?} X {:?}", excl_set1, excl_set2);
            let mut node = TreeNode {
                label: "X".to_string(),
                children: Vec::new(),
            };
            
            info!("Processing first child set: {:?}", excl_set1);
            let child1 = find_cuts_start(
                &dfg,
                &excl_set1,
                &start_activities,
                &end_activities,
            );
            info!("First child result: {:?}", child1);
            node.children.extend(child1);
            
            info!("Processing second child set: {:?}", excl_set2);
            let child2 = find_cuts_start(
                &dfg,
                &excl_set2,
                &start_activities,
                &end_activities,
            );
            info!("Second child result: {:?}", child2);
            node.children.extend(child2);
            
            forest.push(node);
            info!("Returning forest with X node: {:?}", forest);
            return forest;
        } else {
            info!("Exclusive cut invalid - found edges between sets: {:?}", found_edges);
        }
    } else {
        info!("No valid exclusive cut found - one or both sets are empty");
    }

    let (set1, set2) = find_sequence_cut(&filtered_dfg, &all_activities);
    if !set1.is_empty() && !set2.is_empty() {
        info!("Sequence cut found: {:?} -> {:?}", set1, set2);
        let mut node = TreeNode {
            label: "->".to_string(),  // Changed from "seq" to "->"
            children: Vec::new(),
        };
        node.children.extend(find_cuts_start(
            &dfg,
            &set1,
            &start_activities,
            &end_activities,
        ));
        node.children.extend(find_cuts_start(
            &dfg,
            &set2,
            &start_activities,
            &end_activities,
        ));
        forest.push(node);
        return forest;
    }

    let (is_parallel, para_set1, para_set2) = find_parallel_cut(&filtered_dfg, &all_activities);
    if is_parallel
        && !para_set1.is_empty()
        && !para_set2.is_empty()
        && parallel_cut_condition_check(&para_set1, &para_set2, &start_activities, &end_activities)
    {
        info!("Parallel cut found: {:?} + {:?}", para_set1, para_set2);
        let mut node = TreeNode {
            label: "+".to_string(),  // Changed from "para" to "+"
            children: Vec::new(),
        };
        node.children.extend(find_cuts_start(
            &dfg,
            &para_set1,
            &start_activities,
            &end_activities,
        ));
        node.children.extend(find_cuts_start(
            &dfg,
            &para_set2,
            &start_activities,
            &end_activities,
        ));
        forest.push(node);
        return forest;
    }

    let (is_redo, redo_set1, redo_set2) = find_redo_cut(
        &filtered_dfg,
        &all_activities,
        &start_activities,
        &end_activities,
    );
    if is_redo
        && !redo_set2.is_empty()
        && !redo_set1.is_empty()
        && redo_cut_condition_check(
            &filtered_dfg,
            &redo_set1,
            &redo_set2,
            &start_activities,
            &end_activities,
        )
    {
        info!("Redo cut found: {:?} * {:?}", redo_set1, redo_set2);
        let mut node = TreeNode {
            label: "*".to_string(),  // Changed from "redo" to "*"
            children: Vec::new(),
        };
        node.children.extend(find_cuts_start(
            &dfg,
            &redo_set1,
            &start_activities,
            &end_activities,
        ));
        node.children.extend(find_cuts_start(
            &dfg,
            &redo_set2,
            &start_activities,
            &end_activities,
        ));
        forest.push(node);
        return forest;
    }

    info!(
        "No further cuts found for the current set of activities: {:?}",
        all_activities
    );
    
    // Apply fallthrough strategy when no cuts are found
    info!("Applying fallthrough strategy...");
    fallthrough_cuts::find_fallthrough_cut(
        dfg,
        all_activities,
        &start_activities,
        &end_activities,
        FallthroughStrategy::Flower,  // Using Flower model as default fallthrough
    )
    
    // Uncomment the following block to revert to the original behavior
    // that returns individual activities as separate trees
    /*
    let mut forest = Vec::new();
    for activity in all_activities {
        let node = TreeNode {
            label: activity.clone(),
            children: Vec::new(),
        };
        forest.push(node);
    }
    forest
    */
}

// Exclusive cut and --------------
fn find_exclusive_choice_cut(
    dfg: &HashMap<(String, String), usize>,
    all_activities: &HashSet<String>,
) -> (HashSet<String>, HashSet<String>) {
    // Step 1: Convert to undirected adjacency list
    let mut undirected_graph: HashMap<String, HashSet<String>> = HashMap::new();
    let mut directed_graph: HashMap<String, HashSet<String>> = HashMap::new();

    // Build both directed and undirected graphs
    for ((from, to), _) in dfg {
        // Undirected graph (for connected components)
        undirected_graph
            .entry(from.clone())
            .or_default()
            .insert(to.clone());
        undirected_graph
            .entry(to.clone())
            .or_default()
            .insert(from.clone());
            
        // Directed graph (for validation)
        directed_graph
            .entry(from.clone())
            .or_default()
            .insert(to.clone());
    }

    // Ensure all activities are in the graphs, even if isolated
    for activity in all_activities {
        undirected_graph.entry(activity.clone()).or_default();
        directed_graph.entry(activity.clone()).or_default();
    }

    // Step 2: Find connected components in the undirected graph using BFS
    let mut visited: HashSet<String> = HashSet::new();
    let mut components: Vec<HashSet<String>> = Vec::new();

    for activity in all_activities {
        if !visited.contains(activity) {
            let mut component = HashSet::new();
            let mut queue = VecDeque::new();
            queue.push_back(activity.clone());
            visited.insert(activity.clone());

            while let Some(current) = queue.pop_front() {
                component.insert(current.clone());
                for neighbor in undirected_graph.get(&current).unwrap_or(&HashSet::new()) {
                    if !visited.contains(neighbor) {
                        visited.insert(neighbor.clone());
                        queue.push_back(neighbor.clone());
                    }
                }
            }

            components.push(component);
        }
    }

    info!("Found {} connected components: {:?}", components.len(), components);
    
    // If there's only one component, no exclusive cut is possible
    if components.len() <= 1 {
        info!("Only one connected component found, no exclusive cut possible");
        return (HashSet::new(), HashSet::new());
    }

    // Step 3: Check all possible combinations of components to find a valid cut
    let n = components.len();
    for i in 0..n {
        // Try combining component i with other components to form set1
        let mut set1 = components[i].clone();
        let mut set2 = HashSet::new();
        
        // First, try with just component i as set1
        for j in 0..n {
            if i != j {
                set2.extend(components[j].iter().cloned());
            }
        }
        
        info!("Trying component {} as set1: {:?} vs set2: {:?}", i, set1, set2);
        
        // Check if there are any edges between set1 and set2 in the directed graph
        let mut has_edges_between = false;
        'outer: for from in &set1 {
            for to in &set2 {
                if directed_graph.get(from).map_or(false, |neighbors| neighbors.contains(to)) ||
                   directed_graph.get(to).map_or(false, |neighbors| neighbors.contains(from)) {
                    has_edges_between = true;
                    break 'outer;
                }
            }
        }
        
        if !has_edges_between {
            info!("Found valid exclusive cut with {} components: set1={:?}, set2={:?}", 
                  n, set1, set2);
            return (set1, set2);
        }
        
        // If that didn't work, try combining with other components
        for j in (i+1)..n {
            let mut combined_set = components[i].clone();
            combined_set.extend(components[j].iter().cloned());
            
            let mut other_set = HashSet::new();
            for k in 0..n {
                if k != i && k != j {
                    other_set.extend(components[k].iter().cloned());
                }
            }
            
            // Check if there are any edges between the combined set and other set
            let mut has_edges_between = false;
            'inner: for from in &combined_set {
                for to in &other_set {
                    if directed_graph.get(from).map_or(false, |neighbors| neighbors.contains(to)) ||
                       directed_graph.get(to).map_or(false, |neighbors| neighbors.contains(from)) {
                        has_edges_between = true;
                        break 'inner;
                    }
                }
            }
            
            if !has_edges_between {
                info!("Found valid exclusive cut by combining components: set1={:?}, set2={:?}", 
                      combined_set, other_set);
                return (combined_set, other_set);
            }
        }
    }

    // If no valid cut found with the above strategy, try the original approach as fallback
    let mut set1 = HashSet::new();
    let mut set2 = HashSet::new();

    if !components.is_empty() {
        set1 = components[0].clone();
        for comp in components.iter().skip(1) {
            set2.extend(comp.iter().cloned());
        }
    }

    info!("Using fallback exclusive cut: set1={:?}, set2={:?}", set1, set2);
    (set1, set2)
}

fn exclusive_cut_condition_check(
    dfg: &HashMap<(String, String), usize>,
    set1: &HashSet<String>,
    set2: &HashSet<String>,
) -> (bool, Vec<(String, String, bool, bool)>) {
    let mut failures = Vec::new();
    for a in set1 {
        for b in set2 {
            let r1 = is_reachable(dfg, a, b);
            let r2 = is_reachable(dfg, b, a);
            if r1 || r2 {
                failures.push((a.clone(), b.clone(), r1, r2));
            }
        }
    }
    (failures.is_empty(), failures)
}

// ------- Sequence cut and helpers ------------
fn find_sequence_cut(
    dfg: &HashMap<(String, String), usize>,
    all_activities: &HashSet<String>,
) -> (HashSet<String>, HashSet<String>) {
    let sccs = strongly_connected_components(&dfg, &all_activities);
    // println!("SCCs:");
    // for (i, comp) in sccs.iter().enumerate() {
    //     println!("  SCC {}: {:?}", i, comp);
    // }

    let (dag, _) = build_scc_dag(&sccs, &dfg);
    // println!("SCC DAG:");
    // for (from, tos) in &dag {
    //     for to in tos {
    //         println!("  SCC {} -> SCC {}", from, to);
    //     }
    // }

    let (set1, set2) = partition_scc_sets(&dag, &sccs);

    // println!("Set1 (sources): {:?}", set1);
    // println!("Set2 (targets): {:?}", set2);

    (set1, set2)
}

/// Step 1: Tarjan's Algorithm to find SCCs
fn strongly_connected_components(
    dfg: &HashMap<(String, String), usize>,
    all_activities: &HashSet<String>,
) -> Vec<Vec<String>> {
    // Step 1: Build adjacency list
    let mut graph: HashMap<String, Vec<String>> = HashMap::new();
    for ((from, to), _) in dfg.iter() {
        graph.entry(from.clone()).or_default().push(to.clone());
    }
    for activity in all_activities {
        graph.entry(activity.clone()).or_default();
    }

    // Tarjan’s setup
    let mut index = 0;
    let mut indices = HashMap::new();
    let mut lowlink = HashMap::new();
    let mut stack = Vec::new();
    let mut on_stack = HashSet::new();
    let mut sccs = Vec::new();

    fn strongconnect(
        node: &String,
        graph: &HashMap<String, Vec<String>>,
        index: &mut usize,
        indices: &mut HashMap<String, usize>,
        lowlink: &mut HashMap<String, usize>,
        stack: &mut Vec<String>,
        on_stack: &mut HashSet<String>,
        sccs: &mut Vec<Vec<String>>,
    ) {
        indices.insert(node.clone(), *index);
        lowlink.insert(node.clone(), *index);
        *index += 1;
        stack.push(node.clone());
        on_stack.insert(node.clone());

        if let Some(neighbors) = graph.get(node) {
            for neighbor in neighbors {
                if !indices.contains_key(neighbor) {
                    strongconnect(
                        neighbor, graph, index, indices, lowlink, stack, on_stack, sccs,
                    );
                    let low_n = lowlink[neighbor];
                    let low_v = lowlink[node];
                    lowlink.insert(node.clone(), low_v.min(low_n));
                } else if on_stack.contains(neighbor) {
                    let idx_n = indices[neighbor];
                    let low_v = lowlink[node];
                    lowlink.insert(node.clone(), low_v.min(idx_n));
                }
            }
        }

        if indices[node] == lowlink[node] {
            let mut scc = Vec::new();
            while let Some(top) = stack.pop() {
                on_stack.remove(&top);
                scc.push(top.clone());
                if &top == node {
                    break;
                }
            }
            sccs.push(scc);
        }
    }

    // Run Tarjan's on all nodes
    for node in all_activities {
        if !indices.contains_key(node) {
            strongconnect(
                node,
                &graph,
                &mut index,
                &mut indices,
                &mut lowlink,
                &mut stack,
                &mut on_stack,
                &mut sccs,
            );
        }
    }

    sccs
}

/// Step 2: Build SCC DAG
pub fn build_scc_dag(
    sccs: &Vec<Vec<String>>,
    dfg: &HashMap<(String, String), usize>,
) -> (HashMap<usize, HashSet<usize>>, HashMap<String, usize>) {
    let mut node_to_scc = HashMap::new();
    for (i, scc) in sccs.iter().enumerate() {
        for node in scc {
            node_to_scc.insert(node.clone(), i);
        }
    }

    let mut dag: HashMap<usize, HashSet<usize>> = HashMap::new();
    for ((from, to), _) in dfg.iter() {
        let from_scc = node_to_scc[from];
        let to_scc = node_to_scc[to];
        if from_scc != to_scc {
            dag.entry(from_scc).or_default().insert(to_scc);
        }
    }

    (dag, node_to_scc)
}

/// Step 3: Extract set1 and set2 SCCs and their activity sets
pub fn partition_scc_sets(
    dag: &HashMap<usize, HashSet<usize>>,
    sccs: &Vec<Vec<String>>,
) -> (HashSet<String>, HashSet<String>) {
    // Create set1 and set2
    let mut set1: HashSet<usize> = HashSet::new();
    let mut set2: HashSet<usize> = HashSet::new();
    for (from, tos) in dag {
        for to in tos {
            set1.insert(*from);
            set2.insert(*to);
        }
    }

    // Find common activities and remove them from both sets
    let intersection: HashSet<_> = set1.intersection(&set2).cloned().collect();
    let mut common_activities = intersection.clone();

    for i in &intersection {
        set1.remove(i);
        set2.remove(i);
    }

    // For each common activity, decide whether to put it in set1 or set2
    for c in common_activities {
        let mut all_can_reach_and_c_cannot_reach_back = true;

        // Check if every activity 't' in set1 can reach 'c', and 'c' cannot reach 't'
        for t in &set1 {
            if !is_reachable_in_dag(dag, *t, c) || is_reachable_in_dag(dag, c, *t) {
                all_can_reach_and_c_cannot_reach_back = false;
                break;
            }
        }

        if all_can_reach_and_c_cannot_reach_back {
            set2.insert(c);
        } else {
            set1.insert(c);
        }
    }

    // Map SCCs to activity sets
    let mut act_set1 = HashSet::new();
    let mut act_set2 = HashSet::new();

    for i in &set1 {
        for act in &sccs[*i] {
            act_set1.insert(act.clone());
        }
    }

    for i in &set2 {
        for act in &sccs[*i] {
            act_set2.insert(act.clone());
        }
    }

    (act_set1, act_set2)
}

pub fn is_reachable_in_dag(
    dag: &HashMap<usize, HashSet<usize>>,
    activity1: usize,
    activity2: usize,
) -> bool {
    let mut visited = HashSet::new();
    let mut stack = vec![activity1];

    while let Some(current) = stack.pop() {
        if current == activity2 {
            return true;
        }
        if visited.insert(current) {
            if let Some(neighbors) = dag.get(&current) {
                for &neighbor in neighbors {
                    stack.push(neighbor);
                }
            }
        }
    }
    false
}

fn sequence_cut_condition_check(
    dfg: &HashMap<(String, String), usize>,
    set1: &HashSet<String>,
    set2: &HashSet<String>,
) -> (bool, Vec<(String, String, bool, bool)>) {
    let mut failures = Vec::new();
    for a in set1 {
        for b in set2 {
            let r1 = is_reachable(dfg, a, b);
            let r2 = is_reachable(dfg, b, a);
            if !(r1 && !r2) {
                failures.push((a.clone(), b.clone(), r1, r2));
            }
        }
    }
    (failures.is_empty(), failures)
}

// --------------------- Parallel cut and helpers ---------------------

fn find_parallel_cut(
    dfg: &HashMap<(String, String), usize>,
    all_activities: &HashSet<String>,
) -> (bool, HashSet<String>, HashSet<String>) {
    let mut set1: HashSet<String> = HashSet::new();
    let mut set2: HashSet<String> = HashSet::new();

    for act in all_activities {
        if set1.is_empty() {
            set1.insert(act.clone());
            continue;
        }

        let mut singleton = HashSet::new();
        singleton.insert(act.clone());

        if check_bi_direction_sets(dfg, &singleton, &set1)
            && check_bi_direction_sets(dfg, &set1, &singleton)
        {
            set2.insert(act.clone());
        } else {
            if set2.is_empty() {
                set1.insert(act.clone());
                continue;
            }

            if check_bi_direction_sets(dfg, &singleton, &set2)
                && check_bi_direction_sets(dfg, &set2, &singleton)
            {
                set1.insert(act.clone());
            } else {
                return (false, set1, set2);
            }
        }
    }

    (true, set1, set2)
}

fn parallel_cut_condition_check(
    set1: &HashSet<String>,
    set2: &HashSet<String>,
    start_activities: &HashSet<String>,
    end_activities: &HashSet<String>,
) -> bool {
    let cond1 = !set1.is_disjoint(start_activities);
    let cond2 = !set1.is_disjoint(end_activities);
    let cond3 = !set2.is_disjoint(start_activities);
    let cond4 = !set2.is_disjoint(end_activities);

    cond1 && cond2 && cond3 && cond4
}

// --------------------- Redo cut and helpers ---------------------
fn find_redo_cut(
    dfg: &HashMap<(String, String), usize>,
    all_activities: &HashSet<String>,
    start_activities: &HashSet<String>,
    end_activities: &HashSet<String>,
) -> (bool, HashSet<String>, HashSet<String>) {
    let mut set1: HashSet<String> = HashSet::new();
    let mut set2: HashSet<String> = HashSet::new();

    // Add start and end activities to set1
    set1.extend(start_activities.iter().cloned());
    set1.extend(end_activities.iter().cloned());

    for x in all_activities {
        if set1.contains(x) {
            continue;
        }

        let is_s1_redo = is_reachable_before_end_activity(start_activities, x, end_activities, dfg);
        let is_s2_redo = is_reachable_before_end_activity(end_activities, x, start_activities, dfg);

        if is_s1_redo && !is_s2_redo {
            set1.insert(x.clone());
        } else if !is_s1_redo && is_s2_redo {
            set2.insert(x.clone());
        } else {
            return (false, set1, set2);
        }
    }

    (true, set1, set2)
}

fn redo_cut_condition_check(
    dfg: &HashMap<(String, String), usize>,
    set1: &HashSet<String>,
    set2: &HashSet<String>,
    start_activities: &HashSet<String>,
    end_activities: &HashSet<String>,
) -> bool {
    // 1. All start_activities and end_activities must be in set1
    if !start_activities.is_subset(set1) || !end_activities.is_subset(set1) {
        return false;
    }

    // 2. There exists (e, x) ∈ dfg where e ∈ end_activities and x ∈ set2
    let mut cond2 = false;
    for e in end_activities {
        for x in set2 {
            if dfg.contains_key(&(e.clone(), x.clone())) {
                cond2 = true;
                break;
            }
        }
        if cond2 {
            break;
        }
    }
    if !cond2 {
        return false;
    }

    // 3. There exists (x, s) ∈ dfg where x ∈ set2 and s ∈ start_activities
    let mut cond3 = false;
    for x in set2 {
        for s in start_activities {
            if dfg.contains_key(&(x.clone(), s.clone())) {
                cond3 = true;
                break;
            }
        }
        if cond3 {
            break;
        }
    }
    if !cond3 {
        return false;
    }

    // 4. For every e ∈ end_activities, there exists b ∈ set2 such that (e, b) ∈ dfg
    for e in end_activities {
        let mut found = false;
        for b in set2 {
            if dfg.contains_key(&(e.clone(), b.clone())) {
                found = true;
                break;
            }
        }
        if !found {
            return false;
        }
    }

    // 5. For every s ∈ start_activities, there exists b ∈ set2 such that (b, s) ∈ dfg
    for s in start_activities {
        let mut found = false;
        for b in set2 {
            if dfg.contains_key(&(b.clone(), s.clone())) {
                found = true;
                break;
            }
        }
        if !found {
            return false;
        }
    }

    true
}

// --------------------- common helpers ---------------------

fn filter_keep_dfg(
    dfg: &HashMap<(String, String), usize>,
    keep_list: &HashSet<String>,
) -> HashMap<(String, String), usize> {
    dfg.iter()
        .filter(|((from, to), _)| keep_list.contains(from) && keep_list.contains(to))
        .map(|(k, v)| (k.clone(), *v))
        .collect()
}

fn check_bi_direction_sets(
    dfg: &HashMap<(String, String), usize>,
    set1: &HashSet<String>,
    set2: &HashSet<String>,
) -> bool {
    for m in set1 {
        for n in set2 {
            if !dfg.contains_key(&(m.clone(), n.clone()))
                || !dfg.contains_key(&(n.clone(), m.clone()))
            {
                return false;
            }
        }
    }
    true
}

fn get_start_and_end_activities(
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

pub fn is_reachable_before_end_activity(
    start_activities: &HashSet<String>,
    target: &String,
    end_activities: &HashSet<String>,
    dfg: &HashMap<(String, String), usize>,
) -> bool {
    fn dfs(
        current: &String,
        target: &String,
        end_activities: &HashSet<String>,
        dfg: &HashMap<(String, String), usize>,
        visited: &mut HashSet<String>,
    ) -> bool {
        if current == target {
            return true;
        }

        if visited.contains(current) || end_activities.contains(current) {
            return false;
        }

        visited.insert(current.clone());

        for (src, dst) in dfg.keys() {
            if src == current {
                if dfs(dst, target, end_activities, dfg, visited) {
                    return true;
                }
            }
        }

        false
    }

    for start in start_activities {
        let mut visited = HashSet::new();
        if dfs(start, target, end_activities, dfg, &mut visited) {
            return true;
        }
    }

    false
}
