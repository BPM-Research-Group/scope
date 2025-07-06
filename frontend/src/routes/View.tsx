import BreadcrumbNav from '~/components/BreadcrumbNav';
import ViewVariant from '~/components/view/ViewVariant';

const View: React.FC = () => {
    return (
        <div className="h-screen w-screen">
            <BreadcrumbNav />
            <div className="">
                <h1 className="text-4xl font-bold text-center mt-10">How do you want to view your data?</h1>
                <div className="flex flex-row justify-around mt-10">
                    <div className="">
                        <ViewVariant
                            variant="OCPT"
                            description="Visualize your data as an object-centric process tree"
                        />
                    </div>
                    <div className="">
                        <ViewVariant variant="Explore" description="Explore your data through a visual lens" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default View;
