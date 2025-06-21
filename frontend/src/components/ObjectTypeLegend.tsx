import { LegendItem, LegendLabel, LegendOrdinal } from '@visx/legend';
import { ScaleOrdinal } from 'd3';
import { Checkbox } from '~/components/ui/checkbox';
import { useEffect, useState } from 'react';
import { useFilteredObjectType } from '~/store';

interface ObjectTypeLegendProps {
    objectTypes: string[];
    coloring: ScaleOrdinal<string, string, never>;
}

const ObjectTypeLegend: React.FC<ObjectTypeLegendProps> = ({ objectTypes, coloring }: ObjectTypeLegendProps) => {
    const [checked, setChecked] = useState<boolean[]>([]);
    const { setFilteredObjectTypes } = useFilteredObjectType();

    useEffect(() => {
        if (objectTypes) {
            setChecked(new Array(objectTypes.length).fill(false));
        }
    }, [objectTypes]);

    if (!objectTypes) {
        return <div>Loading Legend</div>;
    }

    const handleCheckboxChange = (index: number) => {
        const updatedChecked = [...checked];
        updatedChecked[index] = !updatedChecked[index];
        setChecked(updatedChecked);

        const selectedObjectTypes = objectTypes.filter((_, i) => updatedChecked[i]);
        console.log(selectedObjectTypes);
        setFilteredObjectTypes(selectedObjectTypes);
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
                                    backgroundColor: checked[i] ? label.value : 'white',
                                }}
                                checked={checked[i]}
                                onClick={() => handleCheckboxChange(i)}
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
