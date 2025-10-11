import { LegendItem, LegendLabel, LegendOrdinal } from '@visx/legend';
import { ScaleOrdinal } from 'd3';
import { Checkbox } from '~/components/ui/checkbox';

interface ObjectTypeLegendProps {
    objectTypes: string[];
    coloring: ScaleOrdinal<string, string, never>;
    nodeId: string | undefined;
    filteredObjectTypes: string[];
    onFilteredObjectTypesChange: (newFilteredObjectTypes: string[]) => void;
}

const ObjectTypeLegend: React.FC<ObjectTypeLegendProps> = ({
    objectTypes,
    coloring,
    nodeId,
    filteredObjectTypes,
    onFilteredObjectTypesChange,
}: ObjectTypeLegendProps) => {
    if (!objectTypes) {
        return <div>Loading Legend</div>;
    }

    const handleCheckboxChange = (objectType: string) => {
        if (nodeId) {
            const newFilteredObjectTypes = filteredObjectTypes.includes(objectType)
                ? filteredObjectTypes.filter((ot) => ot !== objectType)
                : [...filteredObjectTypes, objectType];
            onFilteredObjectTypesChange(newFilteredObjectTypes);
        }
    };

    return (
        <LegendOrdinal scale={coloring}>
            {(labels) => (
                <div className="flex flex-col">
                    {labels.map((label, i) => (
                        <LegendItem key={`legend-quantile-${i}`} margin="0 5px">
                            <Checkbox
                                style={{
                                    borderColor: label.value,
                                    backgroundColor: filteredObjectTypes.includes(label.text) ? label.value : 'white',
                                }}
                                checked={filteredObjectTypes.includes(label.text)}
                                onCheckedChange={() => handleCheckboxChange(label.text)}
                            />
                            <LegendLabel align="left" margin="0 0 0 4px">
                                {label.text}
                            </LegendLabel>
                        </LegendItem>
                    ))}
                </div>
            )}
        </LegendOrdinal>
    );
};

export default ObjectTypeLegend;
