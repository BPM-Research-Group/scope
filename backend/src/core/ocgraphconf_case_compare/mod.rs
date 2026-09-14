pub mod compare;
pub mod convert;
pub mod extract;
pub mod metrics;

use crate::models::ocgraphconf_case_compare::{
    OcgraphconfCaseCompareRequest, OcgraphconfCaseCompareResponse,
};
use axum::http::StatusCode;

pub async fn compare_cases_from_collection(
    request: &OcgraphconfCaseCompareRequest,
) -> Result<OcgraphconfCaseCompareResponse, (StatusCode, String)> {
    // Keep the endpoint pipeline explicit: load cases, build local graphs, solve, then aggregate metrics.
    let selected_cases = extract::load_selected_cases(
        &request.case_ocels_file_id,
        request.left_case_index,
        request.right_case_index,
    )
    .await?;

    let left_graph = convert::case_ocel_to_case_graph(&selected_cases.left_case)?;
    let right_graph = convert::case_ocel_to_case_graph(&selected_cases.right_case)?;
    let assignment = compare::compare_case_graphs(&left_graph, &right_graph)?;

    metrics::build_response(
        request,
        &selected_cases,
        &left_graph,
        &right_graph,
        &assignment,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ocel::{OCEL, OCELEvent, OCELObject, OCELRelationship, OCELType};
    use chrono::{FixedOffset, TimeZone};

    fn sample_case(activities: &[&str]) -> OCEL {
        let timezone = FixedOffset::east_opt(0).unwrap();
        let base_time = timezone.with_ymd_and_hms(2025, 10, 4, 7, 0, 0).unwrap();

        let events = activities
            .iter()
            .enumerate()
            .map(|(index, activity)| {
                OCELEvent::new(
                    format!("e{}", index + 1),
                    *activity,
                    base_time + chrono::Duration::minutes((index as i64) * 15),
                    Vec::new(),
                    vec![OCELRelationship::new("o1", "case")],
                )
            })
            .collect();

        OCEL {
            event_types: activities
                .iter()
                .map(|activity| OCELType {
                    name: (*activity).to_string(),
                    attributes: Vec::new(),
                })
                .collect(),
            object_types: vec![OCELType {
                name: "case".to_string(),
                attributes: Vec::new(),
            }],
            events,
            objects: vec![OCELObject {
                id: "o1".to_string(),
                object_type: "case".to_string(),
                attributes: Vec::new(),
                relationships: Vec::new(),
            }],
        }
    }

    #[test]
    fn case_ocel_conversion_builds_expected_graph_shape() {
        let case = sample_case(&["A", "B"]);
        let graph = convert::case_ocel_to_case_graph(&case).unwrap();

        assert_eq!(graph.nodes.len(), 3);
        assert_eq!(graph.edges.len(), 3);
        assert_eq!(graph.ordered_event_ids.len(), 2);
    }

    #[test]
    fn identical_cases_have_zero_cost_and_full_fitness() {
        let case = sample_case(&["A", "B"]);
        let request = OcgraphconfCaseCompareRequest {
            case_ocels_file_id: "ignored".to_string(),
            left_case_index: 0,
            right_case_index: 0,
            include_alignment_details: true,
        };
        let selected_cases = extract::SelectedCases {
            left_case: case.clone(),
            right_case: case,
            attributes: Default::default(),
        };

        let left_graph = convert::case_ocel_to_case_graph(&selected_cases.left_case).unwrap();
        let right_graph = convert::case_ocel_to_case_graph(&selected_cases.right_case).unwrap();
        let assignment = compare::compare_case_graphs(&left_graph, &right_graph).unwrap();
        let response = metrics::build_response(
            &request,
            &selected_cases,
            &left_graph,
            &right_graph,
            &assignment,
        )
        .unwrap();

        assert_eq!(response.alignment_cost, 0.0);
        assert_eq!(response.fitness, 1.0);
        assert_eq!(response.void_node_count, 0);
        assert_eq!(response.void_edge_count, 0);
        assert_eq!(response.left_nodes, left_graph.nodes.len());
        assert_eq!(response.right_nodes, right_graph.nodes.len());
        let details = response.alignment_details.unwrap();
        assert_eq!(details.left_graph_nodes.len(), left_graph.nodes.len());
        assert_eq!(details.left_graph_edges.len(), left_graph.edges.len());
        assert_eq!(details.right_graph_nodes.len(), right_graph.nodes.len());
        assert_eq!(details.right_graph_edges.len(), right_graph.edges.len());
    }

    #[test]
    fn different_cases_reduce_fitness() {
        let left_case = sample_case(&["A", "B"]);
        let right_case = sample_case(&["A"]);
        let request = OcgraphconfCaseCompareRequest {
            case_ocels_file_id: "ignored".to_string(),
            left_case_index: 0,
            right_case_index: 1,
            include_alignment_details: false,
        };
        let selected_cases = extract::SelectedCases {
            left_case,
            right_case,
            attributes: Default::default(),
        };

        let left_graph = convert::case_ocel_to_case_graph(&selected_cases.left_case).unwrap();
        let right_graph = convert::case_ocel_to_case_graph(&selected_cases.right_case).unwrap();
        let assignment = compare::compare_case_graphs(&left_graph, &right_graph).unwrap();
        let response = metrics::build_response(
            &request,
            &selected_cases,
            &left_graph,
            &right_graph,
            &assignment,
        )
        .unwrap();

        assert!(response.alignment_cost > 0.0);
        assert!(response.fitness < 1.0);
        assert_eq!(response.alignment_cost, 3.0);
        assert!((response.fitness - (2.0 / 3.0)).abs() < f64::EPSILON);
        assert!(response.void_node_count > 0 || response.void_edge_count > 0);
        assert!(response.alignment_details.is_none());
    }
}
