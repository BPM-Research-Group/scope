import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Home from '~/routes/Home';
import Upload from '~/routes/Upload';
import OcptViewer from '~/routes/OcptViewer';
import '~/index.css';
import View from '~/routes/View';

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
        path: '/data/view/',
        element: <View />,
    },
    {
        path: '/data/view/ocpt',
        element: <OcptViewer />,
    },
]);

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        {/* <SidebarProvider>
      <AppSidebar />
      <SidebarTrigger /> */}
        <RouterProvider router={router} />
        {/* </SidebarProvider> */}
    </StrictMode>
);
