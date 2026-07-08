import type { ObjectFlowMapRecord, OcelEventData } from '~/types/ocel.types';

// OCEL 2.0 JSON structure as returned by the backend
interface Ocel2Event {
    id: string;
    type: string;
    time: string;
    attributes: unknown[];
    relationships: { objectId: string; qualifier: string }[];
}

interface Ocel2Object {
    id: string;
    type: string;
    attributes: unknown[];
    relationships: unknown[];
}

export interface Ocel2Response {
    eventTypes: { name: string; attributes: unknown[] }[];
    objectTypes: { name: string; attributes: unknown[] }[];
    events: Ocel2Event[];
    objects: Ocel2Object[];
}

/**
 * Converts OCEL 2.0 events into the flat OcelEventData[] format used by FlowWithAnimation.
 * The result is sorted by timestamp and only needs ocel:timestamp / ocel:activity for playback time range.
 */
export const flattenOcel2Events = (ocel: Ocel2Response): OcelEventData[] => {
    return [...ocel.events]
        .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
        .map((e) => ({
            'ocel:eid': e.id,
            'ocel:timestamp': e.time,
            'ocel:activity': e.type,
        }));
};

/**
 * Builds an ObjectFlowMapRecord from OCEL 2.0 data.
 * For each object, collects the ordered list of timestamps and activities
 * from events it participates in (via relationships).
 *
 * The animation matches each token to the flow graph by its exact object-type
 * string (e.g. `${type}-startEvent`). Those graph ids use the OCPT's object-type
 * names (`ocpt.ots`), so token types must use that exact casing. OCEL 2.0 object
 * types are typically lowercase (`worker`) while the OCPT capitalizes them
 * (`Worker`), so we resolve each raw type against the known OCPT types
 * case-insensitively and fall back to first-letter capitalization (the OCEL 1.0
 * behaviour) when no OCPT type is supplied.
 */
export const buildObjectFlowMap = (ocel: Ocel2Response, knownObjectTypes: string[] = []): ObjectFlowMapRecord => {
    const resolveType = (rawType: string): string => {
        const match = knownObjectTypes.find((ot) => ot.toLowerCase() === rawType.toLowerCase());
        return match ?? rawType.charAt(0).toUpperCase() + rawType.slice(1);
    };

    // objectId → OCPT-aligned type name
    const objectTypeById = new Map<string, string>();
    ocel.objects.forEach((obj) => {
        objectTypeById.set(obj.id, resolveType(obj.type));
    });

    const map: ObjectFlowMapRecord = new Map();

    const sortedEvents = [...ocel.events].sort(
        (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
    );

    sortedEvents.forEach((event) => {
        event.relationships.forEach(({ objectId }) => {
            const objType = objectTypeById.get(objectId);
            if (!objType) return;

            const uniqueId = `${objType}-${objectId}`;
            if (!map.has(uniqueId)) {
                map.set(uniqueId, { id: objectId, type: objType, timestamps: [], activities: [] });
            }
            const entry = map.get(uniqueId)!;
            entry.timestamps.push(event.time);
            entry.activities.push(event.type);
        });
    });

    return map;
};
