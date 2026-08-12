use crate::models::ocel::OCEL;
use crate::models::ocgraphconf_case_compare::{EdgeDetail, NodeDetail};
use axum::http::StatusCode;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CaseNodeKind {
    Event {
        event_type: String,
        source_event_id: String,
    },
    Object {
        object_type: String,
        source_object_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaseNode {
    pub id: usize,
    pub kind: CaseNodeKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum CaseEdgeType {
    DF,
    E2O,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CaseEdge {
    pub id: usize,
    pub from: usize,
    pub to: usize,
    pub edge_type: CaseEdgeType,
}

#[derive(Debug, Clone, Default)]
pub struct CaseGraph {
    pub nodes: BTreeMap<usize, CaseNode>,
    pub edges: BTreeMap<usize, CaseEdge>,
    pub ordered_event_ids: Vec<usize>,
    pub object_ids_by_type: BTreeMap<String, Vec<usize>>,
    pub incident_events_by_object: BTreeMap<usize, BTreeSet<usize>>,
    pub df_edge_ids: BTreeMap<(usize, usize), usize>,
    pub e2o_edge_ids: BTreeMap<(usize, usize), usize>,
}

impl CaseGraph {
    #[allow(dead_code)]
    pub fn event_label(&self, node_id: usize) -> Option<&str> {
        match self.nodes.get(&node_id).map(|node| &node.kind) {
            Some(CaseNodeKind::Event { event_type, .. }) => Some(event_type.as_str()),
            _ => None,
        }
    }
}

impl CaseEdgeType {
    pub fn display_label(self) -> &'static str {
        match self {
            Self::DF => "DF (Directly Follows)",
            Self::E2O => "E2O (Event to Object)",
        }
    }

    pub fn element_type(self) -> &'static str {
        match self {
            Self::DF => "df",
            Self::E2O => "e2o",
        }
    }
}

impl From<&CaseNode> for NodeDetail {
    fn from(node: &CaseNode) -> Self {
        let (label, element_type) = match &node.kind {
            CaseNodeKind::Event { event_type, .. } => (event_type.clone(), "event"),
            CaseNodeKind::Object { object_type, .. } => (object_type.clone(), "object"),
        };

        Self {
            id: node.id,
            label,
            element_type: element_type.to_string(),
        }
    }
}

impl From<&CaseEdge> for EdgeDetail {
    fn from(edge: &CaseEdge) -> Self {
        Self {
            id: edge.id,
            source_id: edge.from,
            target_id: edge.to,
            element_type: edge.edge_type.element_type().to_string(),
            label: edge.edge_type.display_label().to_string(),
        }
    }
}

pub fn case_ocel_to_case_graph(case: &OCEL) -> Result<CaseGraph, (StatusCode, String)> {
    if case.events.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Selected case does not contain any events".to_string(),
        ));
    }
    if case.objects.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Selected case does not contain any objects".to_string(),
        ));
    }

    let mut graph = CaseGraph::default();
    let mut next_node_id = 1usize;
    let mut next_edge_id = 1usize;
    let mut object_node_ids = BTreeMap::new();

    // Stable node IDs make solver inputs and optional alignment details deterministic.
    for object in case
        .objects
        .iter()
        .collect::<Vec<_>>()
        .sorted_by(|left, right| left.id.cmp(&right.id))
    {
        let node_id = next_node_id;
        next_node_id += 1;
        object_node_ids.insert(object.id.clone(), node_id);
        graph
            .object_ids_by_type
            .entry(object.object_type.clone())
            .or_default()
            .push(node_id);
        graph
            .incident_events_by_object
            .insert(node_id, BTreeSet::new());
        graph.nodes.insert(
            node_id,
            CaseNode {
                id: node_id,
                kind: CaseNodeKind::Object {
                    object_type: object.object_type.clone(),
                    source_object_id: object.id.clone(),
                },
            },
        );
    }

    let mut ordered_events = case.events.iter().collect::<Vec<_>>();
    // Case graphs use event-time order; event ID is the tie-breaker for repeatable DF edges.
    ordered_events.sort_by(|left, right| match left.time.cmp(&right.time) {
        std::cmp::Ordering::Equal => left.id.cmp(&right.id),
        ordering => ordering,
    });

    let mut event_nodes = Vec::with_capacity(ordered_events.len());
    for event in ordered_events {
        let node_id = next_node_id;
        next_node_id += 1;
        graph.ordered_event_ids.push(node_id);
        graph.nodes.insert(
            node_id,
            CaseNode {
                id: node_id,
                kind: CaseNodeKind::Event {
                    event_type: event.event_type.clone(),
                    source_event_id: event.id.clone(),
                },
            },
        );
        event_nodes.push((event, node_id));
    }

    for event_window in graph.ordered_event_ids.windows(2) {
        let edge_id = next_edge_id;
        next_edge_id += 1;
        let from = event_window[0];
        let to = event_window[1];
        graph.df_edge_ids.insert((from, to), edge_id);
        graph.edges.insert(
            edge_id,
            CaseEdge {
                id: edge_id,
                from,
                to,
                edge_type: CaseEdgeType::DF,
            },
        );
    }

    for (event, event_node_id) in event_nodes {
        // Multiple relationships to the same object collapse to one E2O edge for graph alignment.
        let object_ids: BTreeSet<String> = event
            .relationships
            .iter()
            .map(|relationship| relationship.object_id.clone())
            .collect();
        for object_id in object_ids {
            let object_node_id = object_node_ids.get(&object_id).copied().ok_or_else(|| {
                (
                    StatusCode::BAD_REQUEST,
                    format!(
                        "Selected case references object '{}' that is not present in the case OCEL",
                        object_id
                    ),
                )
            })?;
            let edge_id = next_edge_id;
            next_edge_id += 1;
            graph
                .incident_events_by_object
                .entry(object_node_id)
                .or_default()
                .insert(event_node_id);
            graph
                .e2o_edge_ids
                .insert((event_node_id, object_node_id), edge_id);
            graph.edges.insert(
                edge_id,
                CaseEdge {
                    id: edge_id,
                    from: event_node_id,
                    to: object_node_id,
                    edge_type: CaseEdgeType::E2O,
                },
            );
        }
    }

    Ok(graph)
}

trait SortedByExt<T> {
    fn sorted_by<F>(self, compare: F) -> Vec<T>
    where
        F: FnMut(&T, &T) -> std::cmp::Ordering;
}

impl<I, T> SortedByExt<T> for I
where
    I: IntoIterator<Item = T>,
{
    fn sorted_by<F>(self, mut compare: F) -> Vec<T>
    where
        F: FnMut(&T, &T) -> std::cmp::Ordering,
    {
        let mut items: Vec<T> = self.into_iter().collect();
        items.sort_by(|left, right| compare(left, right));
        items
    }
}
