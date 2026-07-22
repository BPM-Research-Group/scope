import { useCallback } from 'react';
import { FolderOpen } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '~/components/ui/button';
import FileShowcase from '~/components/explore/file/ui/FileShowcase';
import { useStoredFiles } from '~/stores/store';
import { useUploadFileMutation } from '~/services/mutation';
import type { ExtendedFile, FileType } from '~/types/files.types';

const FileList: React.FC = () => {
    const { files, addFile, removeFile } = useStoredFiles();
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
            const ocelFiles = ['construction-site.json', 'order-management.json'];
            for (const fileName of ocelFiles) {
                const ocelResponse = await fetch(`/example_data/ocel/${fileName}`);
                if (ocelResponse.ok) {
                    const ocelBlob = await ocelResponse.blob();
                    console.log('WOrks');
                    const ocelFile = new File([ocelBlob], fileName, { type: 'application/json' });
                    handleFileUpload(ocelFile, 'ocelFile');
                }
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
                files.map((file, index) => (
                    <FileShowcase key={`${file.name}-${index}`} file={file} onFileRemove={removeFile} />
                ))}{' '}
        </div>
    );
};

export default FileList;
