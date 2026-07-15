import { ReactFlowProvider } from '@xyflow/react';
import { Activity } from 'lucide-react';
import OcpnRendering, { OcpnVizParams } from '~/components/ocpn/OcpnRendering';
import { RustOcpnData } from '~/types/ocpn.types';

interface OCPNProps {
    data: RustOcpnData;
    params: OcpnVizParams;
    colorMap: Record<string, string>;
    isExiting?: boolean;
}

const OCPN: React.FC<OCPNProps> = ({ data, params, colorMap, isExiting }) => {
    return (
        <main className="flex-1 flex flex-col relative bg-slate-50/30 min-h-0 min-w-0">
            <div className="flex-1 p-6 overflow-hidden min-h-0 min-w-0 relative">
                <div className="w-full h-full bg-white rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 overflow-hidden relative">
                    {isExiting ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm z-50">
                            <Activity className="w-8 h-8 text-blue-500 animate-spin mb-4" />
                            <p className="text-sm font-semibold text-slate-600 tracking-wide">Loading Pipeline...</p>
                        </div>
                    ) : (
                        <ReactFlowProvider>
                            <div className="absolute inset-0">
                                <OcpnRendering data={data} params={params} colorMap={colorMap} />
                            </div>
                        </ReactFlowProvider>
                    )}
                </div>
            </div>
        </main>
    );
};

export default OCPN;
