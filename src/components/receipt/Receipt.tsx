import { forwardRef } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ReceiptItem {
  productName: string;
  quantity: number;
  price: number;
  total: number;
}

interface ReceiptProps {
  saleNumber: number;
  customerName: string;
  sellerName: string;
  items: ReceiptItem[];
  total: number;
  paymentMethod: string;
  date: Date;
  companyInfo?: {
    name: string;
    cnpj: string;
    address: string;
    phone: string;
  };
}

export const Receipt = forwardRef<HTMLDivElement, ReceiptProps>(
  ({ saleNumber, customerName, sellerName, items, total, paymentMethod, date, companyInfo }, ref) => {
    const defaultCompanyInfo = {
      name: "VYN CRM",
      cnpj: "00.000.000/0001-00",
      address: "Rua Example, 123 - Centro",
      phone: "(11) 99999-9999"
    };

    const company = companyInfo || defaultCompanyInfo;

    return (
      <div 
        ref={ref}
        className="receipt-print max-w-md mx-auto bg-white text-black font-mono text-sm"
        style={{ 
          width: "80mm", 
          minHeight: "200mm",
          padding: "10px",
          fontSize: "12px",
          lineHeight: "1.2"
        }}
      >
        {/* Cabeçalho da Empresa */}
        <div className="text-center border-b-2 border-dashed border-gray-400 pb-4 mb-4">
          <h1 className="text-lg font-bold mb-2">{company.name}</h1>
          <p className="text-xs">CNPJ: {company.cnpj}</p>
          <p className="text-xs">{company.address}</p>
          <p className="text-xs">Tel: {company.phone}</p>
        </div>

        {/* Informações da Venda */}
        <div className="border-b border-dashed border-gray-400 pb-4 mb-4">
          <div className="flex justify-between">
            <span>Cupom Nº:</span>
            <span className="font-bold">#{saleNumber.toString().padStart(6, '0')}</span>
          </div>
          <div className="flex justify-between">
            <span>Data:</span>
            <span>{format(date, "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
          </div>
          <div className="flex justify-between">
            <span>Cliente:</span>
            <span className="truncate ml-2">{customerName}</span>
          </div>
          <div className="flex justify-between">
            <span>Vendedor:</span>
            <span className="truncate ml-2">{sellerName}</span>
          </div>
        </div>

        {/* Itens da Venda */}
        <div className="border-b border-dashed border-gray-400 pb-4 mb-4">
          <h3 className="font-bold mb-2">ITENS</h3>
          {items.map((item, index) => (
            <div key={index} className="mb-2">
              <div className="flex justify-between">
                <span className="truncate flex-1">{item.productName}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span>{item.quantity} x R$ {item.price.toFixed(2)}</span>
                <span className="font-bold">R$ {item.total.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Totais */}
        <div className="border-b border-dashed border-gray-400 pb-4 mb-4">
          <div className="flex justify-between text-base font-bold">
            <span>TOTAL:</span>
            <span>R$ {total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm mt-2">
            <span>Forma de Pagamento:</span>
            <span className="uppercase">{paymentMethod}</span>
          </div>
        </div>

        {/* Rodapé */}
        <div className="text-center text-xs">
          <p className="mb-2">Obrigado pela preferência!</p>
          <p>Sistema VYN CRM</p>
          <p>{format(new Date(), "dd/MM/yyyy HH:mm")}</p>
        </div>

        {/* Linha para corte */}
        <div className="text-center mt-6">
          <p className="text-xs">✂ - - - - - - - - - - - - - - - - - - ✂</p>
        </div>
      </div>
    );
  }
);

Receipt.displayName = "Receipt";