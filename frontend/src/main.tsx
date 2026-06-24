import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Toaster } from '~/components/ui/sonner';
import RedirectErrorBoundary from '~/components/RedirectErrorBoundary';
import '~/index.css';
import AbstractionViewer from '~/routes/AbstractionViewer';
import DeviationViewer from '~/routes/DeviationViewer';
import Explore from '~/routes/Explore';
import FlowViewer from '~/routes/FlowViewer';
import HistViz from '~/routes/Hist-Viz';
import Home from '~/routes/Home';
import OcelViewer from '~/routes/OcelViewer';
import ResourceViewer from '~/routes/ResourceViewer';
import OcptViewer from '~/routes/OcptViewer';
import Pipeline from '~/routes/Pipeline';
import Upload from '~/routes/Upload';
import OcpnViewer from './routes/OcpnViewer';

// Create a client
const queryClient = new QueryClient();

const router = createBrowserRouter([
    {
        path: '/',
        element: <Home />,
    },
    {
        path: '/data/',
        element: <Upload />,
    },
    {
        path: '/data/pipeline/',
        element: <Pipeline />,
    },
    {
        path: '/data/pipeline/explore/',
        element: <Explore />,
    },
    // {
    //     path: '/ocel/ocel-visualization/',
    //     element: <OcelVisualization />,
    // },
    {
        path: '/data/pipeline/explore/ocpt/:nodeId',
        element: (
            <RedirectErrorBoundary>
                <OcptViewer />
            </RedirectErrorBoundary>
        ),
    },
    {
        path: '/data/pipeline/explore/ocel/:nodeId',
        element: (
            <RedirectErrorBoundary>
                <OcelViewer />
            </RedirectErrorBoundary>
        ),
    },
    {
        path: '/data/pipeline/explore/abstraction/:nodeId',
        element: (
            <RedirectErrorBoundary>
                <AbstractionViewer />
            </RedirectErrorBoundary>
        ),
    },
    {
        path: '/data/pipeline/explore/deviations/:nodeId',
        element: (
            <RedirectErrorBoundary>
                <DeviationViewer />
            </RedirectErrorBoundary>
        ),
    },
    {
        path: '/data/pipeline/explore/flow/:nodeId',
        element: (
            <RedirectErrorBoundary>
                <FlowViewer />
            </RedirectErrorBoundary>
        ),
    },
    {
        path: '/data/pipeline/explore/hist-viz/:nodeId',
        element: (
            <RedirectErrorBoundary>
                <HistViz />
            </RedirectErrorBoundary>
        ),
    },
    {
        path: '/data/pipeline/explore/ocpn/:nodeId',
        element: (
            <RedirectErrorBoundary>
                <OcpnViewer />
            </RedirectErrorBoundary>    
         ),
     },
     {       
        path: '/data/pipeline/explore/resource_graph/:nodeId',
        element: (
             <RedirectErrorBoundary>
                <ResourceViewer />
            </RedirectErrorBoundary>
        ),
    },
]);

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            {/* <SidebarProvider>
          <AppSidebar />
          <SidebarTrigger /> */}
            <RouterProvider router={router} />
            {/* </SidebarProvider> */}
            <Toaster
                position="top-center"
                // toastOptions={{
                //     classNames: {
                //         // toast: 'data-[type=success]:bg-green-500 data-[type=success]:text-white',
                //     },
                // }}
            />
            {/* <ReactQueryDevtools /> */}
        </QueryClientProvider>
    </StrictMode>
);
