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
    nets?: Record<string, any>;
}
