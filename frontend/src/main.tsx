import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Home from '~/routes/Home';
import Upload from '~/routes/Upload';
import OcptViewer from '~/routes/OcptViewer';
import '~/index.css';
import Explore from '~/routes/Explore';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

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
        path: '/data/explore/',
        element: <Explore />,
    },
    {
        path: '/data/explore/ocpt',
        element: <OcptViewer />,
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
