import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import '~/index.css';
import Explore from '~/routes/Explore';
import HistViz from '~/routes/Hist-Viz';
import Home from '~/routes/Home';
import OcptViewer from '~/routes/OcptViewer';
import Pipeline from '~/routes/Pipeline';
import Upload from '~/routes/Upload';
import OcelVisualization from './components/ocel/OcelVisualization';
import OcelViewer from './routes/OcelViewer';

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
        element: <OcptViewer />,
    },
    {
        path: '/data/pipeline/explore/ocel/:nodeId',
        element: <OcelViewer />,
    },
    {
        path: '/data/pipeline/explore/hist-viz/:nodeId',
        element: <HistViz />,
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
            <ReactQueryDevtools />
        </QueryClientProvider>
    </StrictMode>
);
