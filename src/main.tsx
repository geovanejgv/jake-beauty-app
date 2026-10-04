import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { mensagemDeErro } from './lib/seguranca/erros'

// Tratamento central de erros (LOG-01): o que a tela não tratou vira mensagem genérica
// com código de correlação; o detalhe vai só para o logger.
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (erro, query) => { mensagemDeErro(erro, 'Falha ao carregar.', `consulta ${String(query.queryKey[0])}`); },
  }),
  mutationCache: new MutationCache({
    onError: (erro, _vars, _ctx, mutation) => {
      if (mutation.options.onError) return; // a própria tela já avisou
      alert(mensagemDeErro(erro, 'Não foi possível salvar. Tente novamente.', 'gravação'));
    },
  }),
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
