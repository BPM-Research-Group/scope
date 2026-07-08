// import { LegendItem, LegendLabel } from '@visx/legend';
// import { ScaleOrdinal } from 'd3';
// import { Checkbox } from '~/components/ui/checkbox';
// interface ObjectTypeLegendProps {
//     objectTypes: string[];
//     coloring: ScaleOrdinal<string, string, never>;
//     nodeId: string | undefined;
//     filteredObjectTypes: string[];
//     onFilteredObjectTypesChange: (newFilteredObjectTypes: string[]) => void;
// }
// const ObjectTypeLegend: React.FC<ObjectTypeLegendProps> = ({
//     objectTypes,
//     coloring,
//     nodeId,
//     filteredObjectTypes,
//     onFilteredObjectTypesChange,
// }: ObjectTypeLegendProps) => {
//     if (!objectTypes) {
//         return <div>Loading Legend</div>;
//     }
//     const handleCheckboxChange = (objectType: string) => {
//         if (nodeId) {
//             const newFilteredObjectTypes = filteredObjectTypes.includes(objectType)
//                 ? filteredObjectTypes.filter((ot) => ot !== objectType)
//                 : [...filteredObjectTypes, objectType];
//             onFilteredObjectTypesChange(newFilteredObjectTypes);
//         }
//     };
//     return (
//         <div className="flex flex-col">
//             {objectTypes.map((ot, i) => {
//                 const color = coloring(ot);
//                 return (
//                     <LegendItem key={i} margin="0 5px">
//                         <Checkbox
//                             style={{
//                                 borderColor: color,
//                                 backgroundColor: filteredObjectTypes.includes(ot) ? color : 'white',
//                             }}
//                             checked={filteredObjectTypes.includes(ot)}
//                             onCheckedChange={() => handleCheckboxChange(ot)}
//                         />
//                         <LegendLabel align="left" margin="0 0 0 4px">
//                             {ot}
//                         </LegendLabel>
//                     </LegendItem>
//                 );
//             })}
//         </div>
//     );
// };
// export default ObjectTypeLegend;
import { LegendItem, LegendLabel } from '@visx/legend';
import { ScaleOrdinal } from 'd3';
import { Checkbox } from '~/components/ui/checkbox';

interface ObjectTypeLegendProps {
    objectTypes: string[];
    coloring: ScaleOrdinal<string, string, never>;
    nodeId: string | undefined;
    filteredObjectTypes: string[];
    onFilteredObjectTypesChange: (newFilteredObjectTypes: string[]) => void;
    isForestMode?: boolean; // NEW PROP
}

const ObjectTypeLegend: React.FC<ObjectTypeLegendProps> = ({
    objectTypes,
    coloring,
    nodeId,
    filteredObjectTypes,
    onFilteredObjectTypesChange,
    isForestMode,
}: ObjectTypeLegendProps) => {
    if (!objectTypes) {
        return <div>Loading Legend</div>;
    }

    const handleCheckboxChange = (objectType: string) => {
        if (nodeId) {
            if (isForestMode) {
                // Single-select logic for Process Forest
                const newFilteredObjectTypes = filteredObjectTypes.includes(objectType) ? [] : [objectType];
                onFilteredObjectTypesChange(newFilteredObjectTypes);
            } else {
                // Multi-select logic for Standard OCPT
                const newFilteredObjectTypes = filteredObjectTypes.includes(objectType)
                    ? filteredObjectTypes.filter((ot) => ot !== objectType)
                    : [...filteredObjectTypes, objectType];
                onFilteredObjectTypesChange(newFilteredObjectTypes);
            }
        }
    };

    return (
        <div className="flex flex-col">
            {objectTypes.map((ot, i) => {
                const color = coloring(ot);
                return (
                    <LegendItem key={i} margin="0 5px">
                        <Checkbox
                            style={{
                                borderColor: color,
                                backgroundColor: filteredObjectTypes.includes(ot) ? color : 'white',
                                borderRadius: isForestMode ? '50%' : '4px', // Circle for radio-button feel in Forest mode
                            }}
                            checked={filteredObjectTypes.includes(ot)}
                            onCheckedChange={() => handleCheckboxChange(ot)}
                        />
                        <LegendLabel align="left" margin="0 0 0 4px">
                            {ot}
                        </LegendLabel>
                    </LegendItem>
                );
            })}
        </div>
    );
};

export default ObjectTypeLegend;
