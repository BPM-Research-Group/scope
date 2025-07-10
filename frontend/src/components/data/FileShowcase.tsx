import React from 'react';
import { Eye, FileJson, FileSpreadsheet, FileX } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAcceptedFile, useJSONFile, useStoredFiles } from '~/stores/store';
import { JSONSchema } from '~/types/ocpt/ocpt.types';
import type { ExtendedFile } from '~/types/fileObject.types';

interface FileShowcaseProps {
    file: ExtendedFile;
}

const FileShowcase: React.FC<FileShowcaseProps> = ({ file }) => {
    console.log(file);
    const { setAcceptedFile } = useAcceptedFile();
    const { setJSONFile } = useJSONFile();
    const { removeFile } = useStoredFiles();
    const navigate = useNavigate();

    const visualizeFile = () => {
        setAcceptedFile(file);
        if (file.name.split('.').pop() === 'json') {
            console.log('Processing JSON file...');
            const reader = new FileReader();

            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target?.result as string) as JSONSchema;
                    console.log('Parsed JSON:', json);

                    setJSONFile(json);

                    navigate('/data/view/');
                } catch (error) {
                    console.error('Error parsing JSON:', error);
                }
            };
            reader.readAsText(file);
        }
    };

    const getFileTypeIcon = (name: string) => {
        const extension = name.split('.').pop();
        if (extension === 'json') {
            return <FileJson className="h-6 w-6 mr-1" />;
        }
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
                <div className="flex items-center justify-center cursor-pointer" onClick={visualizeFile}>
                    <Eye className="h-6 w-6 text-blue-500" />
                    <p className="text-sm ml-1">Visualize</p>
                </div>
                <div className="flex items-center justify-center cursor-pointer" onClick={() => removeFile(file)}>
                    <FileX className="h-6 w-6 text-red-500 ml-4" />
                    <p className="text-sm ml-1">Delete</p>
                </div>
            </div>
        </div>
    );
};

export default FileShowcase;
