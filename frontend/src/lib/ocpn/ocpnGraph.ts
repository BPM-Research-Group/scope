import { OcpnId, RustOcpnPlace } from '~/types/ocpn.types';

export const getArcId = (endpoint: unknown) =>
    typeof endpoint === 'object' && endpoint !== null && 'id' in endpoint ? (endpoint as { id: OcpnId }).id : endpoint;

export const toFlowId = (id: OcpnId | unknown) => String(id);

export const getPlaceObjectTypes = (place: Pick<RustOcpnPlace, 'object_type' | 'object_types'>) => {
    const objectTypes = place.object_types?.length ? place.object_types : place.object_type ? [place.object_type] : [];
    return Array.from(new Set(objectTypes)).sort();
};
