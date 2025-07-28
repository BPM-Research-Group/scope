use crate::models::ocpt::{ProcessForest, TreeNode};
use log::info;
use std::collections::{HashMap, HashSet};

/// Different types of fallthrough strategies that are tried in this specific order:
/// 1. Empty trace
/// 2. Activity once per trace
/// 3. Activity concurrent
/// 4. Strict τ-loop
/// 5. τ-loop
/// 6. Flower model
#[derive(Debug, Clone, Copy, PartialEq, PartialOrd, Eq, Ord)]
pub enum FallthroughStrategy {
    /// Handles empty traces in the log (1)
    EmptyTraces = 0,
    /// Each activity occurs at most once per trace (2)
    ActivityOncePerTrace = 1,
    /// All activities can happen in any order (concurrent) (3)
    ActivityConcurrent = 2,
    /// Creates a strict loop with a tau transition (4)
    StrictTauLoop = 3,
    /// Creates a loop with a tau transition (5)
    TauLoop = 4,
    /// Creates a flower model where all activities are in a loop with a tau transition (6)
    Flower = 5,
}

/// Implements fallthrough behavior when no other cuts are found
/// This is the last resort cut that will be applied when no other cuts are possible
/// The fallthrough strategies are tried in the following order:
/// 1. Empty trace
/// 2. Activity once per trace
/// 3. Activity concurrent
/// 4. Strict τ-loop
/// 5. τ-loop
/// 6. Flower model
pub fn find_fallthrough_cut(
    dfg: &HashMap<(String, String), usize>,
    all_activities: &HashSet<String>,
    start_activities: &HashSet<String>,
    end_activities: &HashSet<String>,
    strategy: FallthroughStrategy,
) -> ProcessForest {
    // Try strategies in the specified order, starting with the requested strategy
    let strategies = [
        FallthroughStrategy::EmptyTraces,
        FallthroughStrategy::ActivityOncePerTrace,
        FallthroughStrategy::ActivityConcurrent,
        FallthroughStrategy::StrictTauLoop,
        FallthroughStrategy::TauLoop,
        FallthroughStrategy::Flower,
    ];

    // Find the starting point based on the requested strategy
    let start_index = strategies.iter().position(|&s| s == strategy).unwrap_or(0);
    
    // Try each strategy in order
    for &current_strategy in &strategies[start_index..] {
        let result = match current_strategy {
            FallthroughStrategy::EmptyTraces => {
                info!("Trying EmptyTraces fallthrough");
                empty_traces(all_activities, start_activities, end_activities)
            }
            FallthroughStrategy::ActivityOncePerTrace => {
                info!("Trying ActivityOncePerTrace fallthrough");
                activity_once_per_trace(all_activities, dfg)
            }
            FallthroughStrategy::ActivityConcurrent => {
                info!("Trying ActivityConcurrent fallthrough");
                activity_concurrent(all_activities)
            }
            FallthroughStrategy::StrictTauLoop => {
                info!("Trying StrictTauLoop fallthrough");
                strict_tau_loop(dfg, all_activities, start_activities, end_activities)
            }
            FallthroughStrategy::TauLoop => {
                info!("Trying TauLoop fallthrough");
                tau_loop(all_activities, start_activities, end_activities)
            }
            FallthroughStrategy::Flower => {
                info!("Trying Flower fallthrough");
                flower_model(all_activities, start_activities, end_activities)
            }
        };
        
        // If the strategy produced a non-empty result, return it
        if !result.is_empty() {
            info!("Applied {:?} fallthrough successfully", current_strategy);
            return result;
        }
    }
    
    // If all else fails, return an empty forest
    info!("No fallthrough strategy produced a valid result");
    Vec::new()
}

/// All activities can happen in any order (concurrent)
/// Returns a parallel operator with all activities as children
fn activity_concurrent(activities: &HashSet<String>) -> ProcessForest {
    let mut forest = Vec::new();
    
    if activities.is_empty() {
        return forest;
    }

    let mut parallel_node = TreeNode {
        label: "+".to_string(),
        children: Vec::new(),
    };

    // Sort activities for consistent output
    let mut sorted_activities: Vec<_> = activities.iter().collect();
    sorted_activities.sort();

    // Add each activity as a child of the parallel node
    for activity in sorted_activities {
        parallel_node.children.push(TreeNode {
            label: activity.to_string(),
            children: Vec::new(),
        });
    }

    forest.push(parallel_node);
    info!("Applied activity_concurrent fallthrough with {} activities", activities.len());
    forest
}

/// Each activity occurs at most once per trace
/// Returns a sequence of activities that each occur exactly once in every trace
fn activity_once_per_trace(activities: &HashSet<String>, dfg: &HashMap<(String, String), usize>) -> ProcessForest {
    let mut forest = Vec::new();
    
    if activities.is_empty() {
        return forest;
    }

    // Count frequency of each activity in the DFG
    let mut activity_frequency: HashMap<&String, usize> = HashMap::new();
    for (from, to) in dfg.keys() {
        *activity_frequency.entry(from).or_insert(0) += 1;
        *activity_frequency.entry(to).or_insert(0) += 1;
    }

    // Find activities that occur exactly once in the DFG
    let once_activities: Vec<_> = activities.iter()
        .filter(|a| activity_frequency.get(a).copied().unwrap_or(0) == 1)
        .collect();

    if once_activities.is_empty() {
        return forest;  // No activities that occur exactly once
    }

    // Sort the once activities by name for consistent output
    let mut sorted_activities = once_activities.clone();
    sorted_activities.sort();
    
    // Log the number of activities being processed
    info!("Found {} activities that occur once", sorted_activities.len());

    // Create a sequence node with the activities
    let mut sequence_node = TreeNode {
        label: "->".to_string(),
        children: Vec::new(),
    };

    for activity in sorted_activities {
        sequence_node.children.push(TreeNode {
            label: activity.to_string(),
            children: Vec::new(),
        });
    }

    forest.push(sequence_node);
    info!("Applied activity_once_per_trace fallthrough with {} activities", once_activities.len());
    forest
}

/// Handles empty traces in the log
/// Returns an XOR node with an empty trace and the rest of the activities
fn empty_traces(activities: &HashSet<String>, start_activities: &HashSet<String>, _end_activities: &HashSet<String>) -> ProcessForest {
    let mut forest = Vec::new();
    
    if activities.is_empty() {
        return forest;
    }

    // Check if there are empty traces (indicated by empty start activities)
    if !start_activities.is_empty() {
        return forest;  // No empty traces to handle
    }

    let mut xor_node = TreeNode {
        label: "X".to_string(),
        children: Vec::new(),
    };

    // Add empty (tau) transition as first child
    xor_node.children.push(TreeNode {
        label: "tau".to_string(),
        children: Vec::new(),
    });

    // Add all activities as individual children
    let mut sorted_activities: Vec<_> = activities.iter().collect();
    sorted_activities.sort();
    
    for activity in sorted_activities {
        xor_node.children.push(TreeNode {
            label: activity.to_string(),
            children: Vec::new(),
        });
    }

    forest.push(xor_node);
    info!("Applied empty_traces fallthrough with {} activities", activities.len());
    forest
}

/// Creates a flower model where all activities are in a loop with a tau transition
/// Returns a loop with a sequence of all activities and a tau transition
fn flower_model(activities: &HashSet<String>, _start_activities: &HashSet<String>, _end_activities: &HashSet<String>) -> ProcessForest {
    let mut forest = Vec::new();
    
    if activities.is_empty() {
        return forest;
    }
    
    // Create the loop node
    let mut loop_node = TreeNode {
        label: "*".to_string(),
        children: Vec::new(),
    };
    
    // Create an exclusive choice node for the do part
    let mut do_node = TreeNode {
        label: "X".to_string(),
        children: Vec::new(),
    };
    
    // Sort activities for consistent output
    let mut sorted_activities: Vec<_> = activities.iter().collect();
    sorted_activities.sort();
    
    // Add all activities to the sequence
    for activity in sorted_activities {
        do_node.children.push(TreeNode {
            label: activity.to_string(),
            children: Vec::new(),
        });
    }
    
    // Add the sequence to the loop (do part)
    loop_node.children.push(do_node);
    
    // Add the tau transition (redo part)
    loop_node.children.push(TreeNode {
        label: "tau".to_string(),
        children: Vec::new(),
    });
    
    forest.push(loop_node);
    info!("Applied flower_model fallthrough with {} activities", activities.len());
    forest
}

/// Creates a loop with a tau transition (similar to strict but only checks for start activities)
/// This is more permissive than strict_tau_loop as it only requires start activities for splitting
fn tau_loop(activities: &HashSet<String>, start_activities: &HashSet<String>, _end_activities: &HashSet<String>) -> ProcessForest {
    let mut forest = Vec::new();
    
    if activities.is_empty() || start_activities.is_empty() {
        return forest;
    }
    
    // Check if there are any points where a start activity appears in the middle of a trace
    // This is a simplified check - in a real implementation, you'd analyze the log
    let has_loop_points = start_activities.len() > 1;  // Simplified check
    
    if !has_loop_points {
        return forest;  // No loop points found
    }
    
    // Create the loop node
    let mut loop_node = TreeNode {
        label: "*".to_string(),
        children: Vec::new(),
    };
    
    // Create a sequence node for the body of the loop
    let mut body_node = TreeNode {
        label: "->".to_string(),
        children: Vec::new(),
    };
    
    // Sort activities for consistent output
    let mut sorted_activities: Vec<_> = activities.iter().collect();
    sorted_activities.sort();
    
    // Add all activities to the body (simplified - in reality, you'd use the projected log)
    for activity in sorted_activities {
        body_node.children.push(TreeNode {
            label: activity.to_string(),
            children: Vec::new(),
        });
    }
    
    // Add the body to the loop (do part)
    loop_node.children.push(body_node);
    
    // Add the tau transition (redo part)
    loop_node.children.push(TreeNode {
        label: "tau".to_string(),
        children: Vec::new(),
    });
    
    forest.push(loop_node);
    info!("Applied tau_loop fallthrough with {} activities", activities.len());
    forest
}

/// Creates a strict loop with a tau transition
/// Looks for points where end activities are followed by start activities
fn strict_tau_loop(
    dfg: &HashMap<(String, String), usize>,
    activities: &HashSet<String>, 
    start_activities: &HashSet<String>, 
    end_activities: &HashSet<String>
) -> ProcessForest {
    let mut forest = Vec::new();
    
    if activities.is_empty() || start_activities.is_empty() || end_activities.is_empty() {
        return forest;
    }
    
    // Find potential loop points (activities that are both end and start activities)
    let loop_points: HashSet<_> = end_activities.intersection(start_activities).collect();
    
    if loop_points.is_empty() {
        return forest;  // No potential loop points found
    }
    
    info!("Found potential loop points: {:?}", loop_points);
    
    // For each potential loop point, try to split the activities
    for &loop_point in &loop_points {
        // The main process is all activities except the loop point
        let mut main_activities: HashSet<_> = activities.difference(&[loop_point.clone()].iter().cloned().collect())
            .cloned()
            .collect();
            
        // If we have no main activities left, skip this loop point
        if main_activities.is_empty() {
            continue;
        }
        
        // Create the loop node
        let mut loop_node = TreeNode {
            label: "*".to_string(),
            children: Vec::new(),
        };
        
        // Filter the DFG to only include transitions between main activities
        let filtered_dfg: HashMap<_, _> = dfg.iter()
            .filter(|&((from, to), _)|
                main_activities.contains(from) && main_activities.contains(to)
            )
            .map(|(k, &v)| (k.clone(), v))
            .collect();
            
        // Get filtered start and end activities
        let filtered_starts: HashSet<_> = start_activities.intersection(&main_activities).cloned().collect();
        let filtered_ends: HashSet<_> = end_activities.intersection(&main_activities).cloned().collect();
        
        // Import the find_cuts_start function
        use crate::core::df2_miner::start_cuts_opti::find_cuts_start;
        
        // Apply inductive miner to the filtered activities
        let main_forest = find_cuts_start(
            &filtered_dfg,
            &main_activities,
            &filtered_starts,
            &filtered_ends
        );
        
        // If we couldn't find a valid cut for the main activities, skip this loop point
        if main_forest.is_empty() {
            continue;
        }
        
        // Add the main process as the do part of the loop
        loop_node.children.extend(main_forest);
        
        // Add the loop point as the redo part
        loop_node.children.push(TreeNode {
            label: loop_point.clone(),
            children: Vec::new(),
        });
        
        // Add the loop node to the forest
        forest.push(loop_node);
        info!("Applied strict_tau_loop with loop point: {}", loop_point);
        return forest;  // Return the first valid loop we find
    }
    
    // If we get here, no valid loop was found
    info!("No valid strict tau loop found");
    forest
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn test_activity_concurrent() {
        let activities: HashSet<String> = ["A", "B", "C"].iter().map(|s| s.to_string()).collect();
        let dfg = HashMap::new();
        let starts = activities.clone();
        let ends = activities.clone();
        
        let result = find_fallthrough_cut(&dfg, &activities, &starts, &ends, FallthroughStrategy::ActivityConcurrent);
        
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].label, "concurrent");
        assert_eq!(result[0].children.len(), 3);
    }

    #[test]
    fn test_activity_once_per_trace() {
        let mut dfg = HashMap::new();
        dfg.insert(("A".to_string(), "B".to_string()), 2);
        dfg.insert(("B".to_string(), "C".to_string()), 1);
        
        let activities: HashSet<String> = ["A", "B", "C"].iter().map(|s| s.to_string()).collect();
        let starts: HashSet<String> = ["A"].iter().map(|s| s.to_string()).collect();
        let ends: HashSet<String> = ["C"].iter().map(|s| s.to_string()).collect();
        
        let result = find_fallthrough_cut(&dfg, &activities, &starts, &ends, FallthroughStrategy::ActivityOncePerTrace);
        
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].label, "seq");
        assert_eq!(result[0].children.len(), 3);
    }
}
