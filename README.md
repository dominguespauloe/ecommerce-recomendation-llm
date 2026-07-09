# 🤖 Sistema de Recomendação Híbrido Semântico (LLM Local + ChromaDB)

Este projeto implementa uma solução moderna de **Busca Híbrida Semântica** para e-commerce. Ele substitui os modelos tradicionais rígidos baseados em *One-Hot Encoding* por uma arquitetura inteligente que utiliza uma **LLM local (Transformers.js)** para gerar *Dense Embeddings* textuais de 384 dimensões combinada com um algoritmo de **re-ranqueamento dinâmico por preço numérico**, consultando o banco de dados vetorial **ChromaDB**.

A aplicação roda **100% offline e local** (sem custos com APIs externas) e oferece uma interface web interativa onde você pode ajustar a relevância do preço em tempo real através de um controle deslizante (*slider*).

---

## 🏗️ Arquitetura do Projeto e Estrutura de Pastas

```text
├── NeuralModels.js      # Core Semântico: Carga da LLM local e geração de Dense Embeddings
├── server.js            # Servidor Backend (Express): API Restful e Algoritmo Híbrido Linear
├── index.html           # Interface Gráfica da aplicação (Frontend)
├── app.js               # Lógica de tela, manipulação do slider e chamadas AJAX (Frontend)
├── users.json           # Banco de dados estruturado em JSON para Clientes e Histórico
└── products.json        # Catálogo de produtos estruturado em JSON
```

---

## 💻 Detalhamento Técnico do Código

### 1. Core de Inteligência Semântica (`NeuralModels.js`)
* **`getEmbeddingPipeline`:** Inicializa e carrega na memória do Node.js o modelo leve e altamente otimizado **`Xenova/all-MiniLM-L6-v2`** da Hugging Face. Ele é responsável por compreender o contexto semântico das palavras.
* **`generateDenseEmbedding`:** Transforma qualquer texto descritivo livre em uma matriz numérica densa (vetor) de **384 dimensões**. Utiliza a estratégia de `pooling: 'mean'` para extrair a média semântica das frases e aplica `normalize: true` para viabilizar o cálculo direto por distância cossena.
* **`createUserProfileVector`:** Avalia o histórico completo de compras do cliente e costura uma string contextual rica para cada item. Em seguida, calcula o **Centróide de Interesses** (média vetorial multidimensional), gerando um único vetor que resume perfeitamente os gostos textuais atuais do usuário.

### 2. Algoritmo Híbrido e Orquestração (`server.js`)
* **Desaninhamento de Lote do ChromaDB:** O ChromaDB retorna dados estruturados em matrizes aninhadas para suportar buscas em lote (`[i]`). O backend desaninhas esses vetores de forma segura para mapear corretamente o `metadata` e o `document` de cada produto, eliminando retornos `undefined`.
* **Fórmula Matemática do Re-ranqueamento Híbrido:** Para equilibrar o contexto textual da LLM com o bolso do cliente, o backend extrai a distância cossena textual ($Dist_{texto}$) do ChromaDB e calcula uma penalidade exponencial financeira ($Dist_{preço}$) baseada na distância absoluta do preço do item versus a média histórica de gastos do usuário:
$$\text{Dist}_{\text{preço}} = 1 - e^{-\frac{|\text{Preço} - \text{Média}|}{100}}$$
* O **Score Combinado Ponderado** final (Distância Final) é calculado dinamicamente com base nos pesos ($W$) regulados pelo slider da tela:
$$\text{Score Final} = (W_{\text{texto}} \times \text{Dist}_{\text{texto}}) + (W_{\text{preço}} \times \text{Dist}_{\text{preço}})$$

### 3. Frontend Dinâmico e Controle de Viés (`app.js` & `index.html`)
* Ao mover o controle deslizante (*slider*) na tela, o arquivo `app.js` captura o valor do peso e dispara uma requisição HTTP contendo o parâmetro na query string (`?priceWeight=X`). O painel se reajusta em milissegundos sem necessidade de recarregar a página.
* Inclui um tratamento de segurança (`safeDistance = r.distance ?? 0`) que blinda o método `.toFixed(4)` do JavaScript contra valores nulos ou zerados caso o produto recomendado seja idêntico ao perfil de busca.

---

## 🛠️ Como Executar no Windows SEM Docker (Modo Nativo)

Se preferir não usar o Docker, você pode rodar o servidor do ChromaDB nativamente no seu Windows utilizando o Python.

### Pré-requisitos
1. **Node.js LTS** (versão 18 ou superior) instalado.
2. **Python 3.10 ou 3.11** instalado (Marque a opção *"Add Python to PATH"* no instalador).
3. Instalar o gerenciador de pacotes do Python.

### Passo a Passo

1. **Instalar o Servidor do ChromaDB via Python:**
   Abra o PowerShell do Windows e instale o pacote oficial:
   ```bash
   pip install chromadb
   ```
2. **Iniciar o Servidor Vetorial:**
   Execute o Chroma indicando a porta 8000:
   ```bash
   chroma run --host localhost --port 8000
   ```
   *Mantenha essa janela do terminal aberta rodando o banco.*

3. **Configurar e Iniciar o Node.js:**
   Abra um novo terminal na pasta raiz do seu projeto e instale as dependências (o Node baixará o módulo `transformers` automaticamente):
   ```bash
   npm install
   node server.js
   ```
   *(Na primeira execução, o Node baixará o arquivo de 45MB da LLM para a sua máquina local. As próximas inicializações serão instantâneas).*

4. **Acessar o Painel:**
   Abra o navegador e acesse: **`http://localhost:3000`**

---

## 🐳 Como Executar no Windows COM Docker (Recomendado)

O Docker elimina a necessidade de configurar ambientes Python locais, isolando o banco vetorial em um contêiner leve e de alta performance.

### Pré-requisitos
1. **Node.js LTS** instalado localmente na máquina Windows.
2. **Docker Desktop** instalado e em execução no Windows.

### Passo a Passo

1. **Subir o Contêiner do ChromaDB:**
   Abra o terminal do Windows (PowerShell ou CMD) e execute o comando abaixo para criar e rodar o banco vetorial com persistência de dados local:
   ```bash
   docker run -d --name chromadb -p 8000:8000 -v ./chroma-data:/chroma/chroma -e IS_PERSISTENT=TRUE -e ANONYMIZED_TELEMETRY=FALSE chromadb/chroma:latest
   ```
   *(Caso já tenha criado este contêiner anteriormente, utilize apenas o comando `docker start chromadb`)*.

2. **Validar a Execução do Banco:**
   Confirme que o contêiner está respondendo corretamente na porta 8000:
   ```bash
   docker ps
   ```

3. **Iniciar a Aplicação Node.js:**
   Navegue até a pasta do seu projeto pelo terminal, instale os pacotes e inicialize o servidor do Express:
   ```bash
   npm install
   node server.js
   ```

4. **Acessar a Interface:**
   Abra o seu navegador e acesse o endereço do painel semântico: **`http://localhost:3000`**

---

## 🕹️ Guia de Teste Comportamental na Tela

1. **Apenas Texto (Slider em 0%):** Escolha o cliente *Lucas Melo*. Com o slider em 0%, o sistema ignora completamente os preços. Ele avaliará semanticamente que o Lucas comprou "Jaqueta de Couro" e "Óculos de Sol Premium" e recomendará itens de alto apelo estético ou visual correlacionados (como camisetas estampadas ou mochilas), mesmo que os preços sejam muito baratos.
2. **Alta Relevância de Preço (Slider em 80%):** Arraste o slider para 80%. O sistema recalculará o Score Combinado. Como a média histórica de gastos do Lucas é alta (R\$ 274.99), os itens têxteis muito baratos serão penalizados pela fórmula exponencial e jogados para o fim da lista. Produtos refinados de maior valor agregado subirão imediatamente para o topo das sugestões, equilibrando o gosto de estilo com o poder de compra do cliente.
