import { createContext, useContext } from 'react';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { DraggableAttributes } from '@dnd-kit/core';

interface DndRowContextValue {
  listeners: SyntheticListenerMap | undefined;
  attributes: DraggableAttributes;
  isDragging: boolean;
  isDndEnabled: boolean;
}

const DndRowContext = createContext<DndRowContextValue>({
  listeners: undefined,
  attributes: {} as DraggableAttributes,
  isDragging: false,
  isDndEnabled: false,
});

export const DndRowProvider = DndRowContext.Provider;
export function useDndRow() {
  return useContext(DndRowContext);
}
