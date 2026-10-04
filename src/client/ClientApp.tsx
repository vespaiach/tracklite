import { useState } from "react";
import { createBrowserRouter, RouterProvider } from "react-router";
import { routes } from "./routes";

export default function ClientApp() {
  const [router] = useState(() => createBrowserRouter(routes));
  return <RouterProvider router={router} />;
}