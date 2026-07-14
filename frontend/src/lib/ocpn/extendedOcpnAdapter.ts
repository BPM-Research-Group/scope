import type { RustOcpnData } from '~/types/ocpn.types';

type ExtendedOcpnPlace = {
    id: string | number;
    name: string;
    object_types?: string[];
    initial?: boolean;
    final?: boolean;
    properties?: Record<string, unknown>;
};

type ExtendedOcpnData = {
    name?: string;
    places?: ExtendedOcpnPlace[];
    transitions?: RustOcpnData['transitions'];
    arcs?: RustOcpnData['arcs'];
    transition_functions?: Record<string, unknown>;
    properties?: Record<string, unknown>;
};

const objectTypeLabel = (objectTypes: string[] | undefined): string => {
    if (!objectTypes || objectTypes.length === 0) return 'unknown';
    return [...objectTypes].sort().join(' + ');
};

export const normalizeOcpnPayload = (payload: unknown): RustOcpnData | null => {
    const value = payload as any;
    const raw = value?.extended_ocpn ?? value?.ocpn ?? value;
    if (!raw?.places || !Array.isArray(raw.places)) return null;

    const extended = raw as ExtendedOcpnData;
    const places = (extended.places ?? []).map((place) => {
        const objectTypes = place.object_types;
        return {
            ...place,
            object_type: (place as any).object_type ?? objectTypeLabel(objectTypes),
            object_types: objectTypes,
            initial: Boolean(place.initial),
            final: Boolean(place.final),
        };
    });

    return {
        ...(raw as RustOcpnData),
        places,
        transitions: extended.transitions ?? [],
        arcs: extended.arcs ?? [],
        object_types: Array.from(new Set(places.map((place) => place.object_type))),
        is_extended_ocpn: Boolean(value?.extended_ocpn ?? raw.transition_functions),
        transition_functions: extended.transition_functions,
    } as RustOcpnData;
};
