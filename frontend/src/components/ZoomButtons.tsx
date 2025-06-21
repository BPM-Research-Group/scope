import {
  AllSidesIcon,
  ResetIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@radix-ui/react-icons';
import { ProvidedZoom } from '@visx/zoom/lib/types';

interface ZoomButtonsProps {
  zoom: ProvidedZoom<SVGSVGElement>;
}

const ZoomButtons: React.FC<ZoomButtonsProps> = ({ zoom }) => {
  return (
    <div className="absolute top-4 left-4 flex w-48 h-8 justify-between items-center border-gray-500 border-[1px] rounded-md shadow-md text-gray-600">
      <div className="flex flex-grow justify-around">
        <button
          type="button"
          onClick={() => zoom.scale({ scaleX: 1.2, scaleY: 1.2 })}
        >
          <ZoomInIcon className="w-6 h-6" />
        </button>
        <button type="button" onClick={zoom.center}>
          <AllSidesIcon className="w-6 h-6" />
        </button>
        <button
          type="button"
          className="btn btn-zoom btn-bottom"
          onClick={() => zoom.scale({ scaleX: 0.8, scaleY: 0.8 })}
        >
          <ZoomOutIcon className="w-6 h-6" />
        </button>
      </div>
      <div className="border-[1px] border-gray-200 h-full"></div>
      <div className="flex flex-grow justify-around">
        <button type="button" className="btn btn-lg" onClick={zoom.reset}>
          <ResetIcon className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};

export default ZoomButtons;
