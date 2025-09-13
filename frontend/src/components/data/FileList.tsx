import { useCallback } from 'react';
import { FolderOpen } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '~/components/ui/button';
import FileShowcase from '~/components/data/FileShowcase';
import { useStoredFiles } from '~/stores/store';
import { useUploadFileMutation } from '~/services/mutation';
import type { ExtendedFile } from '~/types/fileObject.types';
import type { FileType } from '~/types/files.types';

const FileList: React.FC = () => {
    const { files, addFile } = useStoredFiles();
    const uploadFileMutation = useUploadFileMutation();

    const handleFileUpload = useCallback(
        (file: File, fileType: FileType) => {
            const fileWithId = Object.assign(file, {
                id: uuidv4(),
                fileType,
            }) as ExtendedFile;

            addFile(fileWithId);
            uploadFileMutation.mutate(fileWithId);
        },
        [addFile, uploadFileMutation]
    );

    const loadExampleFiles = async () => {
        try {
            const ocelResponse = await fetch('/example_data/ocel/ocel_v2_123.json');
            if (ocelResponse.ok) {
                const ocelBlob = await ocelResponse.blob();
                const ocelFile = new File([ocelBlob], 'ocel_v2_123.json', { type: 'application/json' });
                handleFileUpload(ocelFile, 'ocelFile');
            }

            const ocptFiles = ['order_management_tree.json', 'presentation_example.json', 'very_small_ocpt.json'];
            for (const fileName of ocptFiles) {
                const response = await fetch(`/example_data/ocpt/${fileName}`);
                if (response.ok) {
                    const blob = await response.blob();
                    const file = new File([blob], fileName, { type: 'application/json' });
                    handleFileUpload(file, 'ocptFile');
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
