import { useState, useCallback } from "react";
import type { BetSelection } from "@/components/terminal/MultiBetSlip";

let selectionIdCounter = 0;

export function useBetQueue() {
  const [selections, setSelections] = useState<BetSelection[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const addSelection = useCallback((bet: Omit<BetSelection, "id" | "stake">) => {
    const newSelection: BetSelection = {
      ...bet,
      id: `bet-${++selectionIdCounter}`,
      stake: "10",
    };
    
    setSelections(prev => {
      const existingIndex = prev.findIndex(
        s => s.marketId === bet.marketId && 
             s.outcomeId === bet.outcomeId && 
             s.direction === bet.direction
      );
      
      if (existingIndex >= 0) {
        return prev;
      }
      
      return [...prev, newSelection];
    });
    
    setIsOpen(true);
    setIsMinimized(false);
  }, []);

  const removeSelection = useCallback((id: string) => {
    setSelections(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (filtered.length === 0) {
        setIsOpen(false);
        setIsMinimized(false);
      }
      return filtered;
    });
  }, []);

  const updateSelection = useCallback((id: string, updates: Partial<BetSelection>) => {
    setSelections(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const clearAll = useCallback(() => {
    setSelections([]);
    setIsOpen(false);
    setIsMinimized(false);
  }, []);

  const toggleMinimize = useCallback(() => {
    setIsMinimized(prev => !prev);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsMinimized(false);
  }, []);

  const open = useCallback(() => {
    if (selections.length > 0) {
      setIsOpen(true);
      setIsMinimized(false);
    }
  }, [selections.length]);

  return {
    selections,
    isMinimized,
    isOpen,
    addSelection,
    removeSelection,
    updateSelection,
    clearAll,
    toggleMinimize,
    close,
    open,
    hasSelections: selections.length > 0,
  };
}
