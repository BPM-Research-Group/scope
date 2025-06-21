import BreadcrumbNav from '~/components/BreadcrumbNav';
import ViewVariant from '~/components/view/ViewVariant';

const View: React.FC = () => {
  return (
    <div className="h-screen w-screen">
      <BreadcrumbNav />
      <div className="">
        <h1 className="text-4xl font-bold text-center mt-10">
          How do you want to view your data?
        </h1>
        <div className="flex flex-row w-full justify-center mt-10">
          <ViewVariant variant="OCPT" />
        </div>
      </div>
    </div>
  );
};

export default View;
