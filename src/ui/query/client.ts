import { MutationCache, QueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/ui/store'
import { useReaderStore } from '@/ui/store/reader'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      const { libraryRevision } = useReaderStore.getState()
      const { libraryRevision: revision } = mutation.meta ?? {}
      if (revision !== undefined && revision !== libraryRevision) return
      if (!mutation.meta?.inlineError) useAppStore.getState().setError(error.message)
    },
  }),
})
