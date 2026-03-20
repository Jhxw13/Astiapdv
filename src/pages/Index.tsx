import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Index = () => {
  const { usuario, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      navigate(usuario ? "/dashboard" : "/auth", { replace: true });
    }
  }, [usuario, loading, navigate]);

  return null;
};

export default Index;
