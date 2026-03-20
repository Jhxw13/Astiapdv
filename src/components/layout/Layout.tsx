import { useEffect } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { TopBar } from "./TopBar";
import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { UpdateNotification } from "@/components/ui/UpdateNotification";
import { iniciarMonitor, pararMonitor } from "@/lib/offline";
import { sistemaAPI } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function Layout({ children, title = "Dashboard" }: LayoutProps) {
  const { toast } = useToast();

  useEffect(() => {
    const serverURL = sistemaAPI.getServerURL();
    iniciarMonitor(serverURL, (qtd) => {
      toast({
        title: `✅ ${qtd} venda${qtd > 1 ? "s" : ""} sincronizada${qtd > 1 ? "s" : ""}`,
        description: "Vendas offline enviadas ao servidor com sucesso.",
      });
    });
    return () => pararMonitor();
  }, []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <OfflineBanner />
          <TopBar title={title} />
          <UpdateNotification />
          <main className="flex-1 p-6 overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
