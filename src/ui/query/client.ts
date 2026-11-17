import { MutationCache, QueryClient } from '@tanstack/react-query'
import { useAppStore } from '@/ui/store'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: false },
  },
  mutationCache: new MutationCache({
    onError: (error) => useAppStore.getState().setError(error.message),
  }),
})
