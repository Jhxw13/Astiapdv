/**
 * VYN CRM - StoreContext
 * Stub de compatibilidade - dados reais vêm das APIs direto
 */
import { createContext, useContext, ReactNode } from 'react';

export interface Product {
  id: string; name: string; price: number; category: string;
  code: string; stock: number; status: 'ativo' | 'inativo';
}

export interface SaleItem {
  productId: string; productName: string; quantity: number;
  price: number; total: number;
}

export interface Sale {
  customerId: string; customerName: string; items: SaleItem[];
  total: number; paymentMethod: string; status: 'completed' | 'cancelled';
}

interface StoreContextType {
  products: Product[];
  customers: any[];
  getTotalRevenue: () => number;
  getTotalSales: () => number;
  getActiveCustomers: () => number;
  getLowStockProducts: () => any[];
  addSale: (sale: Sale) => void;
  addCustomer: (customer: any) => void;
}

const StoreContext = createContext<StoreContextType>({
  products: [], customers: [],
  getTotalRevenue: () => 0, getTotalSales: () => 0,
  getActiveCustomers: () => 0, getLowStockProducts: () => [],
  addSale: () => {}, addCustomer: () => {},
});

export function useStore() { return useContext(StoreContext); }

export function StoreProvider({ children }: { children: ReactNode }) {
  return (
    <StoreContext.Provider value={{
      products: [], customers: [],
      getTotalRevenue: () => 0, getTotalSales: () => 0,
      getActiveCustomers: () => 0, getLowStockProducts: () => [],
      addSale: () => {}, addCustomer: () => {},
    }}>
      {children}
    </StoreContext.Provider>
  );
}
