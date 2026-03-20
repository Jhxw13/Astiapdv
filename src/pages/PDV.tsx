import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useStore, Product } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ReceiptModal } from "@/components/receipt/ReceiptModal";
import {
  ShoppingCart,
  Scan,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  DollarSign,
  Receipt,
  User
} from "lucide-react";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  category: string;
  stock: number;
}

export default function PDV() {
  const { products, addSale, customers, addCustomer } = useStore();
  const { toast } = useToast();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [barcode, setBarcode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [lastSaleData, setLastSaleData] = useState<any>(null);
  
  const activeProducts = products.filter(p => p.status === 'ativo' && p.stock > 0);

  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      toast({
        title: "Produto sem estoque",
        description: "Este produto não possui estoque disponível",
        variant: "destructive"
      });
      return;
    }

    const existingItem = cart.find(item => item.id === product.id);
    if (existingItem) {
      if (existingItem.quantity >= product.stock) {
        toast({
          title: "Estoque insuficiente",
          description: `Apenas ${product.stock} unidades disponíveis`,
          variant: "destructive"
        });
        return;
      }
      updateQuantity(product.id, existingItem.quantity + 1);
    } else {
      setCart([...cart, { 
        id: product.id,
        name: product.name,
        price: product.price,
        quantity: 1,
        category: product.category,
        stock: product.stock
      }]);
    }

    toast({
      title: "Produto adicionado",
      description: `${product.name} foi adicionado ao carrinho`
    });
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }

    const cartItem = cart.find(item => item.id === id);
    if (cartItem && quantity > cartItem.stock) {
      toast({
        title: "Estoque insuficiente",
        description: `Apenas ${cartItem.stock} unidades disponíveis`,
        variant: "destructive"
      });
      return;
    }

    setCart(cart.map(item => 
      item.id === id ? { ...item, quantity } : item
    ));
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
    toast({
      title: "Produto removido",
      description: "Item removido do carrinho"
    });
  };

  const getTotalValue = () => {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const getTotalItems = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const handleFinalizeSale = (paymentMethod: 'dinheiro' | 'cartao' | 'pix') => {
    if (cart.length === 0) {
      toast({
        title: "Carrinho vazio",
        description: "Adicione produtos antes de finalizar a venda",
        variant: "destructive"
      });
      return;
    }

    if (!customerName.trim()) {
      setIsCustomerDialogOpen(true);
      return;
    }

    // Add sale
    const saleData = {
      customerId: Date.now().toString(), // Simple ID generation
      customerName: customerName.trim(),
      items: cart.map(item => ({
        productId: item.id,
        productName: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      })),
      total: getTotalValue(),
      paymentMethod,
      status: 'completed' as const
    };

    addSale(saleData);

    // Preparar dados para o cupom
    const receiptData = {
      saleNumber: Date.now(), // Usar timestamp como número da venda
      customerName: customerName.trim(),
      sellerName: "Vendedor", // Pode ser obtido do contexto de autenticação
      items: cart.map(item => ({
        productName: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      })),
      total: getTotalValue(),
      paymentMethod: paymentMethod === 'cartao' ? 'Cartão' : 
                   paymentMethod === 'dinheiro' ? 'Dinheiro' : 'PIX',
      date: new Date()
    };

    setLastSaleData(receiptData);

    toast({
      title: "Venda finalizada!",
      description: `Venda de R$ ${getTotalValue().toFixed(2)} realizada com sucesso`,
    });

    // Reset form
    setCart([]);
    setCustomerName("");
    
    // Abrir modal do cupom
    setIsReceiptModalOpen(true);
  };

  const searchProduct = () => {
    if (!barcode.trim()) return;

    const product = activeProducts.find(p => 
      p.code.toLowerCase().includes(barcode.toLowerCase()) ||
      p.name.toLowerCase().includes(barcode.toLowerCase())
    );

    if (product) {
      addToCart(product);
      setBarcode("");
    } else {
      toast({
        title: "Produto não encontrado",
        description: "Verifique o código ou nome do produto",
        variant: "destructive"
      });
    }
  };

  return (
    <Layout title="PDV - Ponto de Venda">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
        {/* Área de Produtos */}
        <div className="lg:col-span-2 space-y-4">
          {/* Scanner/Busca */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Scan className="w-5 h-5 mr-2" />
                Scanner / Busca de Produtos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex space-x-2">
                <Input
                  placeholder="Digite o código de barras ou nome do produto"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={searchProduct}>
                  <Scan className="w-4 h-4 mr-2" />
                  Buscar
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Lista de Produtos */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>Produtos Disponíveis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <h3 className="font-medium">{product.name}</h3>
                      <Badge variant="secondary" className="text-xs mt-1">
                        {product.category}
                      </Badge>
                      <p className="text-lg font-bold text-primary mt-2">
                        R$ {product.price.toFixed(2)}
                      </p>
                    </div>
                    <Button
                      onClick={() => addToCart(product)}
                      className="btn-gradient"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Carrinho */}
        <div className="space-y-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center">
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Carrinho
                </span>
                <Badge variant="secondary">
                  {getTotalItems()} {getTotalItems() === 1 ? 'item' : 'itens'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {cart.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Carrinho vazio</p>
                  <p className="text-sm">Adicione produtos para começar</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center space-x-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{item.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          R$ {item.price.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center">{item.quantity}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => removeFromCart(item.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Total e Finalização */}
          {cart.length > 0 && (
            <Card className="glass-card">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <Separator />
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-primary">
                      R$ {getTotalValue().toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <Button
                      className="w-full btn-gradient"
                      onClick={() => handleFinalizeSale('cartao')}
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Cartão
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => handleFinalizeSale('dinheiro')}
                    >
                      <DollarSign className="w-4 h-4 mr-2" />
                      Dinheiro
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full"
                      onClick={() => handleFinalizeSale('pix')}
                    >
                      <Receipt className="w-4 h-4 mr-2" />
                      PIX
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Modal do Cupom */}
      {lastSaleData && (
        <ReceiptModal
          isOpen={isReceiptModalOpen}
          onClose={() => setIsReceiptModalOpen(false)}
          saleData={lastSaleData}
        />
      )}

      {/* Dialog para adicionar cliente */}
      <Dialog open={isCustomerDialogOpen} onOpenChange={setIsCustomerDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Cliente</DialogTitle>
            <DialogDescription>
              Informe o nome do cliente para finalizar a venda
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="customer-name">Nome do Cliente</Label>
              <Input
                id="customer-name"
                placeholder="Digite o nome do cliente"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsCustomerDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={() => {
                  if (customerName.trim()) {
                    setIsCustomerDialogOpen(false);
                  }
                }}
                disabled={!customerName.trim()}
              >
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}