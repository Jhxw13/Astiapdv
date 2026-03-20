import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { StoreProvider } from "@/contexts/StoreContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import DashboardCaixa from "./pages/DashboardCaixa";
import PDVNew from "./pages/PDVNew";
import Products from "./pages/Products";
import Clientes from "./pages/Clientes";
import Vendas from "./pages/Vendas";
import Pedidos from "./pages/Pedidos";
import Financeiro from "./pages/Financeiro";
import Relatorios from "./pages/Relatorios";
import Configuracoes from "./pages/Configuracoes";
import Impressao from "./pages/Impressao";
import ConsultaPreco from "./pages/ConsultaPreco";
import Trocas from "./pages/Trocas";
import NotFound from "./pages/NotFound";
import Importacao from "./pages/Importacao";
import Fornecedores from "./pages/Fornecedores";
import Compras from "./pages/Compras";
import Representantes from "./pages/Representantes";
import FechamentoCaixa from "./pages/FechamentoCaixa";
import PedidosOnline from "./pages/PedidosOnline";
import RelatoriosEcommerce from "./pages/RelatoriosEcommerce";
import ScannerMobile from "./pages/ScannerMobile";
import Flyers from "./pages/Flyers";

const queryClient = new QueryClient();

function HomeRedirect() {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/auth" replace />;
  if (usuario.cargo === 'caixa') return <Navigate to="/caixa" replace />;
  if (usuario.cargo === 'vendedor') return <Navigate to="/pdv" replace />;
  return <Navigate to="/dashboard" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <AuthProvider>
        <StoreProvider>
          <TooltipProvider>
            <Toaster />
            <HashRouter>
              <Routes>
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/consulta-preco" element={<ConsultaPreco />} />

                <Route path="/dashboard" element={
                  <ProtectedRoute roles={['admin','gerente']}>
                    <Dashboard />
                  </ProtectedRoute>
                } />
                <Route path="/caixa" element={
                  <ProtectedRoute roles={['admin','gerente','caixa']}>
                    <DashboardCaixa />
                  </ProtectedRoute>
                } />
                <Route path="/pdv" element={
                  <ProtectedRoute roles={['admin','gerente','vendedor','caixa']}>
                    <PDVNew />
                  </ProtectedRoute>
                } />
                <Route path="/produtos" element={
                  <ProtectedRoute roles={['admin','gerente','vendedor']}>
                    <Products />
                  </ProtectedRoute>
                } />
                <Route path="/clientes" element={
                  <ProtectedRoute roles={['admin','gerente','vendedor']}>
                    <Clientes />
                  </ProtectedRoute>
                } />
                <Route path="/vendas" element={
                  <ProtectedRoute roles={['admin','gerente','vendedor']}>
                    <Vendas />
                  </ProtectedRoute>
                } />
                <Route path="/pedidos" element={
                  <ProtectedRoute roles={['admin','gerente','vendedor']}>
                    <Pedidos />
                  </ProtectedRoute>
                } />
                <Route path="/financeiro" element={
                  <ProtectedRoute roles={['admin','gerente']}>
                    <Financeiro />
                  </ProtectedRoute>
                } />
                <Route path="/relatorios" element={
                  <ProtectedRoute roles={['admin','gerente']}>
                    <Relatorios />
                  </ProtectedRoute>
                } />
                <Route path="/impressao" element={
                  <ProtectedRoute roles={['admin','gerente','vendedor']}>
                    <Impressao />
                  </ProtectedRoute>
                } />
                <Route path="/configuracoes" element={
                  <ProtectedRoute roles={['admin','gerente']}>
                    <Configuracoes />
                  </ProtectedRoute>
                } />
                <Route path="/trocas" element={
                  <ProtectedRoute roles={['admin','gerente','vendedor']}>
                    <Trocas />
                  </ProtectedRoute>
                } />
                <Route path="/importacao" element={
                  <ProtectedRoute roles={['admin']}>
                    <Importacao />
                  </ProtectedRoute>
                } />
                <Route path="/fornecedores" element={
                  <ProtectedRoute roles={['admin','gerente']}>
                    <Fornecedores />
                  </ProtectedRoute>
                } />
                <Route path="/compras" element={
                  <ProtectedRoute roles={['admin','gerente']}>
                    <Compras />
                  </ProtectedRoute>
                } />
                <Route path="/representantes" element={
                  <ProtectedRoute roles={['admin','gerente']}>
                    <Representantes />
                  </ProtectedRoute>
                } />
                <Route path="/fechamento-caixa" element={
                  <ProtectedRoute roles={['admin','gerente']}>
                    <FechamentoCaixa />
                  </ProtectedRoute>
                } />
                <Route path="/pedidos-online" element={
                  <ProtectedRoute roles={['admin','gerente']}>
                    <PedidosOnline />
                  </ProtectedRoute>
                } />
                <Route path="/relatorios-ecommerce" element={
                  <ProtectedRoute roles={['admin','gerente']}>
                    <RelatoriosEcommerce />
                  </ProtectedRoute>
                } />
                {/* Scanner mobile — acessível sem login para uso pelo celular */}
                <Route path="/scanner" element={<ScannerMobile />} />
                <Route path="/flyers" element={
                  <ProtectedRoute roles={['admin','gerente','vendedor']}>
                    <Flyers />
                  </ProtectedRoute>
                } />
              <Route path="*" element={<NotFound />} />
              </Routes>
            </HashRouter>
          </TooltipProvider>
        </StoreProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
