// export type ObjectType = string;

// export interface OCPNPlace {
//     id: string;
//     name: string;
//     objectType: ObjectType;
//     initial?: boolean;
//     final?: boolean;
//     x?: number;
//     y?: number;
// }

// export interface OCPNTransition {
//     id: string;
//     name: string;
//     label?: string;
//     silent?: boolean;
//     x?: number;
//     y?: number;
// }

// export type ArcType = 'normal' | 'variable';

// export interface OCPNAv {
//     kind: 'place' | 'transition';
//     id: string;
// }

// export interface OCPNArc {
//     id: string;
//     source: string | OCPNAv;
//     target: string | OCPNAv;
//     type: ArcType;
//     objectType: ObjectType;
//     variable?: boolean;
//     weight?: number;
// }

// export interface OCPNModel {
//     places: OCPNPlace[];
//     transitions: OCPNTransition[];
//     arcs: OCPNArc[];
//     objectTypes?: ObjectType[];
// }

// // OCEL Types
// export interface OCELRelationship {
//     objectId: string;
//     qualifier: string;
// }

// export interface OCELEvent {
//     id: string;
//     type: string;
//     time: string;
//     attributes: any[];
//     relationships: OCELRelationship[];
// }

// export interface OCELObject {
//     id: string;
//     type: string;
//     attributes: any[];
// }

// export interface OCELModel {
//     eventTypes: { name: string; attributes: any[] }[];
//     objectTypes: { name: string; attributes: any[] }[];
//     events: OCELEvent[];
//     objects: OCELObject[];
// }

export type OcpnEndpointKind = 'place' | 'transition';

export interface OcpnArcEndpoint {
    kind: OcpnEndpointKind;
    id: string;
}

export interface RustOcpnPlace {
    id: string;
    name: string;
    object_type: string;
    initial: boolean;
    final: boolean;
}

export interface RustOcpnTransition {
    id: string;
    name: string;
    label?: string | null;
    silent: boolean;
}

export interface RustOcpnArc {
    id: string;
    source: OcpnArcEndpoint;
    target: OcpnArcEndpoint;
    variable: boolean;
    weight: number;
}

export interface RustOcpnData {
    name: string;
    places: RustOcpnPlace[];
    transitions: RustOcpnTransition[];
    arcs: RustOcpnArc[];
    nets?: Record<string, any>; // For the nested subnets if needed later
}
