import type { ComponentType } from "react"
import {
createContext,
useContext
} from "react"
import useMeasure from "react-use-measure"


// ============================================================================
// Types
// ============================================================================

export type ViewComponent = ComponentType<Record<string, unknown>>


export interface ViewsRegistry {
  [viewName: string]: ViewComponent
}


// ============================================================================
// Context
// ============================================================================

export interface FamilyDrawerContextValue {
  isOpen: boolean
  view: string
  setView: (view: string) => void
  opacityDuration: number
  elementRef: ReturnType<typeof useMeasure>[0]
  bounds: ReturnType<typeof useMeasure>[1]
  views: ViewsRegistry | undefined
}


export const FamilyDrawerContext = createContext<FamilyDrawerContextValue | undefined>(
  undefined
)


export function useFamilyDrawer() {
  const context = useContext(FamilyDrawerContext)
  if (!context) {
    throw new Error(
      "FamilyDrawer components must be used within FamilyDrawerRoot"
    )
  }
  return context
}
