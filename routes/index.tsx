import Header from "../islands/Header.tsx";
import HomePage from "../islands/HomePage.tsx";
import { CONTRACTS } from "../lib/contracts.ts";

export default function Home() {
  const tokenAddress = CONTRACTS.ETHOS_USD_TOKEN;

  return (
    <div class="min-h-screen flex flex-col">
      <Header currentPath="/" />

      <main class="flex-1">
        <HomePage />
      </main>

      <footer class="border-t border-ethos-border/50 py-8 mt-auto">
        <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p class="text-gray-500 text-sm">
              Built on{" "}
              <a href="https://tempo.xyz" target="_blank" rel="noopener" class="text-ethos-accent hover:underline">
                Tempo
              </a>{" "}
              · Powered by{" "}
              <a href="https://ethos.network" target="_blank" rel="noopener" class="text-ethos-accent hover:underline">
                Ethos
              </a>
            </p>
            <div class="flex items-center gap-4 text-sm text-gray-500">
              <a href="https://docs.tempo.xyz" target="_blank" rel="noopener" class="hover:text-white transition-colors">
                Docs
              </a>
              <a 
                href={`https://explore.tempo.xyz/token/${tokenAddress}`} 
                target="_blank" 
                rel="noopener" 
                class="hover:text-white transition-colors"
              >
                Explorer
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
