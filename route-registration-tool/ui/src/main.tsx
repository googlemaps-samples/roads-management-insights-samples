import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import * as ReactDOM from "react-dom/client"

import "./index.css"

import GlobalStyles from "@mui/material/GlobalStyles"
import { StyledEngineProvider } from "@mui/material/styles"

import App from "./App.tsx"

// Create a client
const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StyledEngineProvider enableCssLayer>
    <GlobalStyles styles="@layer theme, base, mui, components, utilities;" />
    <QueryClientProvider client={queryClient}>
      <App />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StyledEngineProvider>,
)
