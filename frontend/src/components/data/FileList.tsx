import FileShowcase from '~/components/data/FileShowcase';
import { useStoredFiles } from '~/stores/store';

const FileList: React.FC = () => {
    const { files } = useStoredFiles();

    return (
        <div className="w-full mt-2">
            {files.length > 0 &&
                files.map((file, index) => file && <FileShowcase key={`${file.name}-${index}`} file={file} />)}
        </div>
    );
};

export default FileList;
