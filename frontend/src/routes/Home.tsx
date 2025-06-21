import { useNavigate } from 'react-router-dom';
import BreadcrumbNav from '~/components/BreadcrumbNav';
import { Button } from '~/components/ui/button';

const Home: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="w-screen h-screen flex flex-col">
      <BreadcrumbNav />
      <div className="flex flex-col flex-grow items-center justify-center">
        <h1 className="font-bold text-5xl">Object-centric Visualizations</h1>
        <p className="text-xl text-center w-1/2">
          This is a collection of object-centric visualizations. The goal is to
          provide a set of visualizations that help users understand the
          structure and relationships of their process data better.
        </p>
        <div className="mt-8 flex flex-col items-center">
          <h2 className="text-lg">Begin by uploading a dataset</h2>
          <Button onClick={() => navigate('/data')} className="w-40">
            Upload Dataset
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Home;
