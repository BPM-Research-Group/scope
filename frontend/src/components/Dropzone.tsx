import { DropEvent, FileRejection, useDropzone } from 'react-dropzone';
import { useStoredFiles } from '~/stores/store';
import { FileUp } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

const Dropzone: React.FC = () => {
    // const { setAcceptedFile } = useAcceptedFile();
    const { addFile } = useStoredFiles();

    const onDropAccepted = async (acceptedFiles: File[]) => {
        //Accepted Files is always an Array in React-Dropzone even if maxFiles is set to 1
        const id = uuidv4();
        addFile({
            id,
            file: acceptedFiles[0],
        });
    };

    const onDropRejected = async (rejectedFiles: FileRejection[], event: DropEvent) => {
        //Can be used to display error messages in the future
    };

    const { getRootProps, getInputProps } = useDropzone({
        onDropRejected,
        onDropAccepted,
        accept: {
            'text/csv': ['.csv'],
            'application/json': ['.json'],
        },
        maxFiles: 1,
    });

    return (
        <div
            className="flex flex-col items-center justify-center mt-4 border-[1px] rounded-3xl border-black border-opacity-25 h-48 w-full hover:border-blue-500 hover:shadow-lg transition-all duration-200"
            {...getRootProps()}
        >
            <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center">
                <FileUp className="w-10 h-10 text-blue-500" />
            </div>
            <p className=" text-gray-600 text-xl text-center mt-4">
                <span className="text-blue-500 font-semibold cursor-pointer">Click here </span>
                to upload your file or drag.
            </p>
            <p className="text-gray-400 text-l text-center">
                Accepted file types: <span className="font-semibold">.csv, .json</span>
            </p>
            <input {...getInputProps()} />
        </div>
    );
};

export default Dropzone;
