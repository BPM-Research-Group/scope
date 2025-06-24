import { Eye, FileSpreadsheet } from 'lucide-react';
import { useObjectFlowMap, useOcel, useOcelFile } from '~/stores/store';
import Papa from 'papaparse';
import type { ObjectFlowMapRecord, OcelEventData } from '~/types/ocel.types';
import { useEffect } from 'react';

interface CsvEventLogShowcaseProps {
    file: File;
}

const CsvEventLogShowcase: React.FC<CsvEventLogShowcaseProps> = ({ file }) => {
    const { ocelFile, setOcelFile } = useOcelFile();
    const { setObjectFlowMap } = useObjectFlowMap();
    const { setOcel } = useOcel();

    useEffect(() => {
        if (!ocelFile) return;

        const sortedEvents = [...ocelFile].sort((a, b) => {
            const dateA = new Date(a['ocel:timestamp']);
            const dateB = new Date(b['ocel:timestamp']);
            return dateA.getTime() - dateB.getTime();
        });

        setOcel(sortedEvents);

        // Extract all type patterns (ocel:type:*)
        const objectTypes = new Set<string>();
        const objectMap: ObjectFlowMapRecord = new Map();

        sortedEvents.forEach((event) => {
            // Find all keys that match the pattern ocel:type:*
            Object.keys(event).forEach((key) => {
                if (key.startsWith('ocel:type:')) {
                    let objType = key.substring(10); // Remove "ocel:type:" prefix
                    // Capitalize first letter
                    objType = objType.charAt(0).toUpperCase() + objType.slice(1);

                    // Get the object ID for this type
                    const objectId: string = event[key as keyof OcelEventData];

                    // If empty string then there is no object for that event
                    if (objectId.length === 0) {
                        return;
                    }

                    objectTypes.add(objType);
                    let objectIds = [objectId];

                    if (objectId.includes(',')) {
                        objectIds = objectId.split(',');
                    }

                    objectIds.forEach((objId) => {
                        // Create a unique identifier for this object
                        const uniqueId = `${objType}-${objId}`;

                        // Initialize if this is the first time we see this object
                        if (!objectMap.has(uniqueId)) {
                            objectMap.set(uniqueId, {
                                id: objId,
                                type: objType,
                                timestamps: [],
                                activities: [],
                            });
                        }

                        // Add timestamp and activity for this object
                        const obj = objectMap.get(uniqueId)!;
                        obj.timestamps.push(event['ocel:timestamp']);
                        obj.activities.push(event['ocel:activity']);
                    });
                }
            });
        });
        console.log(objectMap);
        setObjectFlowMap(objectMap);
    }, [ocelFile]);

    const parseOcelFile = () => {
        if (file.name.split('.').pop() === 'csv') {
            Papa.parse<OcelEventData>(file, {
                delimiter: ';',
                header: true,
                complete: (results) => {
                    if (results.errors.length > 0) {
                        console.error(results.errors);
                    }
                    setOcelFile(results.data);
                },
            });
        }
    };

    const getFileTypeIcon = (name: string) => {
        const extension = name.split('.').pop();
        if (extension === 'csv') {
            return <FileSpreadsheet className="h-6 w-6 mr-1" />;
        }
        return 'unknown';
    };

    return (
        <div className="flex items-center h-16 w-full border-gray-200 border-y-[1px]">
            <div className="flex justify-center items-center ml-4">
                {getFileTypeIcon(file.name)}
                <p className="font-semibold">{file.name}</p>
            </div>
            <div className="flex justify-between ml-auto mr-4">
                <div className="flex items-center justify-center cursor-pointer" onClick={parseOcelFile}>
                    <Eye className="h-6 w-6 text-blue-500" />
                    <p className="text-sm ml-1">Visualize</p>
                </div>
            </div>
        </div>
    );
};

export default CsvEventLogShowcase;
