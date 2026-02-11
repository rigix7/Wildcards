import { cn } from "@/lib/utils";
import { Check, X, AlertTriangle, Info } from "lucide-react";
import { useEffect, useState, useCallback } from "react";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose: () => void;
}

const icons = {
  success: Check,
  error: X,
  warning: AlertTriangle,
  info: Info,
};

const colors = {
  success: "border-wild-scout/30 text-wild-scout",
  error: "border-wild-brand/30 text-wild-brand",
  warning: "border-wild-gold/30 text-wild-gold",
  info: "border-wild-trade/30 text-wild-trade",
};

export function Toast({ message, type = "info", duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const Icon = icons[type];

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className={cn(
        "fixed bottom-20 left-1/2 -translate-x-1/2 z-50 min-w-[250px] max-w-[90%]",
        "bg-[var(--card-bg)] border rounded-lg p-3 shadow-2xl",
        "flex items-center gap-3 transition-opacity duration-300",
        colors[type],
        isVisible ? "opacity-100" : "opacity-0"
      )}
      data-testid="toast"
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-xs text-[var(--text-primary)]">{message}</span>
    </div>
  );
}

interface ToastState {
  message: string;
  type: ToastType;
  id: number;
}

let toastId = 0;

export function useTerminalToast() {
  const [toasts, setToasts] = useState<ToastState[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { message, type, id }]);
  }, []);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const ToastContainer = () => (
    <>
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </>
  );

  return { showToast, ToastContainer };
}
