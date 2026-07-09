import { pipeline } from '@xenova/transformers';
import fs from 'fs';

export const TIERS = ['premium', 'medium', 'basic'];

const MODEL_SAVE_PATH = './saved_neural_model';
let embeddingPipelineInstance = null;

/**
 * INICIALIZAÇÃO DA LLM: 
 * Carrega o modelo de embeddings semânticos para a memória
 */
async function getEmbeddingPipeline() {
    if (!embeddingPipelineInstance) {
        console.log("⏳ Carregando modelo LLM Semântico (all-MiniLM-L6-v2) na memória...");
        // Carrega o modelo otimizado para rodar em CPU/Node.js local de forma extremamente rápida
        embeddingPipelineInstance = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.log("🚀 LLM Semântica carregada com sucesso!");
    }
    return embeddingPipelineInstance;
}

/**
 * DENSE EMBEDDING: 
 * Transforma qualquer texto/descrição em um vetor de 384 dimensões
 */
export async function generateDenseEmbedding(text) {
    const pipe = await getEmbeddingPipeline();
    
    // Executa a inferência na LLM local
    const output = await pipe(text, {
        pooling: 'mean',      // Aplica a média matemática dos tokens
        normalize: true      // Normaliza o vetor para busca direta por Distância Cossena
    });

    // Converte o formato interno do tensorflow.js nativo para um array plano JavaScript comum
    return Array.from(output.data);
}

/**
 *  PROFILE DO USUÁRIO: 
 *  Gera o vetor de perfil médio baseado nas compras
 */
export async function createUserProfileVector(userPurchases) {
    if (!userPurchases || userPurchases.length === 0) {
        // Retorna um vetor nulo de 384 dimensões se o usuário não tiver histórico
        return Array(384).fill(0);
    }

    const vectorsPromises = userPurchases.map(async (p) => {
        // CriaDO uma frase (DESCRIÇÃO) para a LLM interpretar o contexto completo do produto
        const contextualDescription = `Produto: ${p.name}. Categoria: ${p.category}. Atributos: cor ${p.color}, faixa de preço avaliada em R$ ${p.price}.`;
        return await generateDenseEmbedding(contextualDescription);
    });

    const vectors = await Promise.all(vectorsPromises);

    // Calcula a média vetorial multidimensional (Centróide de Interesses) do usuário
    const dimensions = vectors[0].length;
    const meanVector = Array(dimensions).fill(0);

    for (let i = 0; i < dimensions; i++) {
        let sum = 0;
        for (let j = 0; j < vectors.length; j++) {
            sum += vectors[j][i];
        }
        meanVector[i] = sum / vectors.length;
    }

    return meanVector;
}

/**
 * Métodos da primeira versão.
 * deixei aqui para não quebrar o código.
 * rotas antigas do Express
 */
export async function trainModelOnData() { 
    console.log("💡 Nota: Com Dense Embeddings e LLMs pré-treinadas, o re-treinamento manual de camadas sequenciais não é mais obrigatório.");
    return true; 
}
export async function saveModelInstance() { return true; }
export async function loadSavedModel() { return true; }
