import { FolderOpen } from 'lucide-react';
import { Button } from '~/components/ui/button';
import FileShowcase from '~/components/data/FileShowcase';
import { useStoredFiles } from '~/stores/store';
import type { ExtendedFile } from '~/types/fileObject.types';

const FileList: React.FC = () => {
    const { files, addFile } = useStoredFiles();

    const loadExampleFiles = async () => {
        try {
            const ocelResponse = await fetch('/example_data/ocel/ocel_v2_123.json');
            if (ocelResponse.ok) {
                const ocelBlob = await ocelResponse.blob();
                const ocelFile = new File([ocelBlob], 'ocel_v2_123.json', { type: 'application/json' });
                const extendedOcelFile: ExtendedFile = Object.assign(ocelFile, { 
                    id: Date.now().toString(), 
                    fileType: 'ocelFile' as const 
                });
                addFile(extendedOcelFile);
            }

            const ocptFiles = ['order_management_tree.json', 'presentation_example.json', 'very_small_ocpt.json'];
            for (const fileName of ocptFiles) {
                const response = await fetch(`/example_data/ocpt/${fileName}`);
                if (response.ok) {
                    const blob = await response.blob();
                    const file = new File([blob], fileName, { type: 'application/json' });
                    const extendedFile: ExtendedFile = Object.assign(file, { 
                        id: (Date.now() + Math.random()).toString(), 
                        fileType: 'ocptFile' as const 
                    });
                    addFile(extendedFile);
                }
            }
        } catch (error) {
            console.error('Failed to load example files:', error);
        }
    };

    return (
        <div className="w-full mt-2">
            {files.length === 0 && (
                <div className="flex flex-col items-center justify-center p-8 text-gray-500">
                    <p className="mb-4">No files uploaded yet</p>
                    <Button onClick={loadExampleFiles} variant="outline" className="flex items-center gap-2">
                        <FolderOpen size={16} />
                        Load Example Files
                    </Button>
                </div>
            )}
            {files.length > 0 &&
                files.map((file, index) => file && <FileShowcase key={`${file.name}-${index}`} file={file} />)}
        </div>
    );
};

export default FileList;
