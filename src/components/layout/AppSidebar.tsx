/**
 * VYN CRM - Sidebar v2.2
 * Nome da loja e logo vindos das configurações
 * Sidebar do caixa mostra só Caixa e PDV
 */
import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { configAPI } from "@/lib/api";
import {
  LayoutDashboard, Package, ShoppingCart, TrendingUp,
  Users, Settings, CreditCard, BarChart3, Wallet,
  Shield, LogOut, Printer, Home, Barcode, ArrowLeftRight, Upload,
  Truck, ShoppingBag, UserCheck, ClipboardCheck, Globe, BarChart2, ScanLine, Megaphone
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { isRestrictedStoreAdmin } from "@/lib/admin-access";

// Permissões por cargo:
// admin    → tudo
// gerente  → tudo exceto: criar usuário admin, banco de dados, dados da loja, fiscal NF-e
// vendedor → PDV, Vendas (só suas), Pedidos, Clientes, Produtos (só visualização), Impressão de etiquetas, Consulta Preço
// caixa    → Caixa + PDV
// ecommerce: true → só aparece se config.ecommerce_ativo estiver ligado
const menuItems = [
  // ── PDV ──────────────────────────────────────────────────────
  { title: "Dashboard",        url: "/dashboard",       icon: LayoutDashboard, roles: ["admin","gerente"] },
  { title: "Caixa",            url: "/caixa",           icon: Home,            roles: ["admin","gerente","caixa"] },
  { title: "PDV",              url: "/pdv",             icon: ShoppingCart,    roles: ["admin","gerente","vendedor","caixa"] },
  // ── Estoque / Compras ─────────────────────────────────────────
  { title: "Produtos",         url: "/produtos",        icon: Package,         roles: ["admin","gerente","vendedor"] },
  { title: "Fornecedores",     url: "/fornecedores",    icon: Truck,           roles: ["admin","gerente"] },
  { title: "Compras",          url: "/compras",         icon: ShoppingBag,     roles: ["admin","gerente"] },
  // ── Comercial ────────────────────────────────────────────────
  { title: "Vendas",           url: "/vendas",          icon: TrendingUp,      roles: ["admin","gerente","vendedor"] },
  { title: "Pedidos",          url: "/pedidos",         icon: CreditCard,      roles: ["admin","gerente","vendedor"] },
  { title: "Trocas",           url: "/trocas",          icon: ArrowLeftRight,  roles: ["admin","gerente","vendedor","caixa"] },
  { title: "Clientes",         url: "/clientes",        icon: Users,           roles: ["admin","gerente","vendedor"] },
  { title: "Representantes",   url: "/representantes",  icon: UserCheck,       roles: ["admin","gerente"] },
  // ── Financeiro ───────────────────────────────────────────────
  { title: "Financeiro",       url: "/financeiro",      icon: Wallet,          roles: ["admin","gerente"] },
  { title: "Fiados",           url: "/fiados",          icon: CreditCard,      roles: ["admin","gerente"] },
  { title: "Fechamento Caixa", url: "/fechamento-caixa",icon: ClipboardCheck,  roles: ["admin","gerente"] },
  // ── Relatórios / Utilitários ──────────────────────────────────
  { title: "Relatórios",       url: "/relatorios",      icon: BarChart3,       roles: ["admin","gerente"] },
  { title: "Etiquetas",        url: "/impressao",       icon: Printer,         roles: ["admin","gerente","vendedor"] },
  { title: "Flyers & Promoções",url: "/flyers",          icon: Megaphone,       roles: ["admin","gerente","vendedor"] },
  { title: "Consulta Preço",   url: "/consulta-preco",  icon: Barcode,         roles: ["admin","gerente","vendedor"] },
  { title: "Scanner Mobile",   url: "/scanner",         icon: ScanLine,        roles: ["admin","gerente","vendedor","caixa"] },
  { title: "Importação",       url: "/importacao",      icon: Upload,          roles: ["admin"] },
  // ── E-commerce (só aparece se ativado nas configurações) ──────
  { title: "Pedidos Online",   url: "/pedidos-online",        icon: Globe,    roles: ["admin","gerente"], ecommerce: true },
  { title: "Rel. E-commerce",  url: "/relatorios-ecommerce",  icon: BarChart2,roles: ["admin","gerente"], ecommerce: true },
  // ── Sistema ───────────────────────────────────────────────────
  { title: "Configurações",    url: "/configuracoes",   icon: Settings,        roles: ["admin","gerente"] },
];

export function AppSidebar() {
  const { usuario, logout } = useAuth();
  const { state } = useSidebar();
  const location = useLocation();
  const navigate = useNavigate();
  const collapsed = state === "collapsed";

  const [config, setConfig] = useState<any>({});
  const [logoError, setLogoError] = useState(false);

  const recarregarConfig = () => {
    configAPI.get().then(c => { if (c) { setConfig(c); setLogoError(false); } }).catch(() => {});
  };

  useEffect(() => {
    recarregarConfig();
    // Recarrega config ao voltar para qualquer página (detecta mudanças salvas em Configurações)
    window.addEventListener("astia:config-updated", recarregarConfig);
    return () => window.removeEventListener("astia:config-updated", recarregarConfig);
  }, []);

  const cargo = usuario?.cargo || "vendedor";
  const nome  = usuario?.nome  || "Usuário";
  const ecommerceAtivo = !!config.ecommerce_ativo;
  const restrictedAdmin = isRestrictedStoreAdmin(usuario);

  const filteredItems = menuItems.filter(item => {
    if (restrictedAdmin) return item.url === "/configuracoes";
    if (!item.roles.includes(cargo)) return false;
    if ((item as any).ecommerce && !ecommerceAtivo) return false;
    return true;
  });

  const nomeLoja = config.nome || "ASTIA PDV";
  const logoPath = config.logo_path;

  return (
    <Sidebar className="bg-gradient-to-b from-primary to-secondary border-r border-border/50" collapsible="icon">
      <SidebarHeader className="p-4">
        {!collapsed ? (
          <div className="flex items-center space-x-3 min-w-0">
            {/* Logo ou ícone */}
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0 overflow-hidden">
              {logoPath && !logoError ? (
                <img
                  src={logoPath.startsWith("http") ? logoPath : `file://${logoPath}`}
                  alt="Logo"
                  className="w-full h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <span className="text-white font-bold text-lg">
                  {nomeLoja.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="text-white min-w-0">
              <h2 className="font-bold text-base leading-tight truncate">{nomeLoja}</h2>
              <p className="text-xs text-white/70">Gestão Local</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center overflow-hidden">
              {logoPath && !logoError ? (
                <img
                  src={logoPath.startsWith("http") ? logoPath : `file://${logoPath}`}
                  alt="Logo"
                  className="w-full h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <span className="text-white font-bold">{nomeLoja.charAt(0).toUpperCase()}</span>
              )}
            </div>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="text-white/60 font-medium mb-1 text-xs uppercase tracking-wide">
              Menu
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {filteredItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  {/* Separador visual antes do e-commerce */}
                  {item.url === "/pedidos-online" && !collapsed && (
                    <div className="px-3 pt-3 pb-1">
                      <div className="border-t border-white/20" />
                      <p className="text-white/40 text-xs mt-2 uppercase tracking-wider flex items-center gap-1">
                        <Globe className="w-3 h-3" /> E-commerce
                      </p>
                    </div>
                  )}
                  {item.url === "/pedidos-online" && collapsed && (
                    <div className="px-2 py-1"><div className="border-t border-white/20" /></div>
                  )}
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      className={`flex items-center px-3 py-2.5 rounded-lg transition-all duration-150 ${
                        location.pathname === item.url
                          ? "bg-white/20 text-white shadow"
                          : "text-white/75 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <item.icon className={`w-5 h-5 shrink-0 ${!collapsed ? "mr-3" : ""}`} />
                      {!collapsed && <span className="font-medium text-sm truncate">{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10">
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarFallback className="bg-white text-primary font-semibold text-xs">
                  {nome.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-white min-w-0">
                <p className="font-medium text-xs truncate">{nome}</p>
                <p className="text-xs text-white/60 capitalize">{cargo}</p>
              </div>
              <Shield className="w-3 h-3 text-white/40 shrink-0" />
            </div>
            <Button variant="ghost" size="sm" onClick={() => { logout(); navigate("/auth"); }}
              className="w-full justify-start text-white/70 hover:text-white hover:bg-white/10 text-xs h-8">
              <LogOut className="w-4 h-4 mr-2" />Sair
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-white text-primary font-semibold text-xs">
                {nome.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <Button variant="ghost" size="sm" onClick={() => { logout(); navigate("/auth"); }}
              className="p-1.5 text-white/70 hover:text-white hover:bg-white/10">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
