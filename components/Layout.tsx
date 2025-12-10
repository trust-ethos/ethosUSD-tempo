import { ComponentChildren } from "preact";

interface LayoutProps {
  children: ComponentChildren;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div class="min-h-screen flex flex-col">
      <header class="border-b border-ethos-border/50 backdrop-blur-sm bg-ethos-darker/80 sticky top-0 z-50">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex items-center justify-between h-16">
            <a href="/" class="flex items-center gap-3 group">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-ethos-primary to-ethos-secondary flex items-center justify-center shadow-lg shadow-ethos-primary/30">
                <span class="text-white font-bold text-lg">$</span>
              </div>
              <div>
                <h1 class="text-xl font-bold text-gradient">$ethosUSD</h1>
                <p class="text-xs text-gray-500">The stablecoin built on credibility</p>
              </div>
            </a>
            
            <nav class="flex items-center gap-6">
              <a href="/" class="text-gray-400 hover:text-white transition-colors">
                Transactions
              </a>
              <a href="/dashboard" class="text-gray-400 hover:text-white transition-colors">
                Dashboard
              </a>
            </nav>
          </div>
        </div>
      </header>
      
      <main class="flex-1">
        {children}
      </main>
      
      <footer class="border-t border-ethos-border/50 py-8 mt-auto">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p class="text-gray-500 text-sm">
              Built on <a href="https://tempo.xyz" target="_blank" rel="noopener" class="text-ethos-accent hover:underline">Tempo</a> · Powered by <a href="https://ethos.network" target="_blank" rel="noopener" class="text-ethos-accent hover:underline">Ethos</a>
            </p>
            <div class="flex items-center gap-4 text-sm text-gray-500">
              <a href="https://docs.tempo.xyz" target="_blank" rel="noopener" class="hover:text-white transition-colors">Docs</a>
              <a href="https://github.com" target="_blank" rel="noopener" class="hover:text-white transition-colors">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

