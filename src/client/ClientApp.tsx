import { useState } from "react";
import { Provider } from "react-redux";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./routes";
import { makeStore } from "./store";
import { Toaster } from "./Toaster";

export default function ClientApp() {
  const [router] = useState(() => createBrowserRouter(routes));
  const [store] = useState(() => makeStore(router));
  return (
    <Provider store={store}>
      <RouterProvider router={router} />
      <Toaster />
    </Provider>
  );
}