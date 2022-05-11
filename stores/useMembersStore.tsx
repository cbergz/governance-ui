import create, { State } from 'zustand'
import { ViewState } from '@components/Members/types'
import { Member, Delegates } from '@utils/uiTypes/members'

interface MembersStore extends State {
  compact: {
    currentView: ViewState
    currentMember: Member | null
    delegates: Delegates | null
  }
  setCurrentCompactViewMember: (item: Member) => void
  setCurrentCompactView: (viewState: ViewState) => void
  resetCompactViewState: () => void
  setDelegates: (delegates: Delegates) => void
}

const compactDefaultState = {
  currentView: ViewState.MainView,
  currentMember: null,
  delegates: null,
}

const useMembersStore = create<MembersStore>((set, _get) => ({
  compact: {
    ...compactDefaultState,
  },
  setCurrentCompactViewMember: (item) => {
    set((s) => {
      s.compact.currentMember = item
    })
  },
  setCurrentCompactView: (viewState) => {
    set((s) => {
      s.compact.currentView = viewState
    })
  },
  resetCompactViewState: () => {
    set((s) => {
      s.compact = { ...compactDefaultState }
    })
  },
  setDelegates: (delegates: Delegates) => {
    set((s) => {
      s.compact.delegates = delegates
    })
  },
}))

export default useMembersStore
