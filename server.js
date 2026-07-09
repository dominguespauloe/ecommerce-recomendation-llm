import express from 'express';
import { ChromaClient } from 'chromadb';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';

import { 
    generateDenseEmbedding, 
    createUserProfileVector,
    TIERS
} from './NeuralModels.js';

const app = express();
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.use('/tfjs-vis', express.static(path.join(__dirname, 'node_modules', '@tensorflow', 'tfjs-vis', 'dist')));

const raw_data='./data'
const usersFilePath = path.join(__dirname, `${raw_data}/users.json`);
const productsFilePath = path.join(__dirname, `${raw_data}/products.json`);


function loadUsersFromDisk() {
    return JSON.parse(fs.readFileSync(usersFilePath, 'utf8'));
}

const products = JSON.parse(fs.readFileSync(productsFilePath, 'utf8'));

// Inicialização do client
const client = new ChromaClient({ host: "localhost", port: 8000 });
let collection;
let trainingLogs = { loss: [], accuracy: [] };

async function syncChromaDB() {
    try { await client.deleteCollection({ name: "production_dense_chroma" }); } catch(e){}
    collection = await client.getOrCreateCollection({ name: "production_dense_chroma" });

    console.log("\n=======================================================");
    console.log("⏳ INDEXANDO CATÁLOGO COM PROMPTS DESCRIÇÃO SEMÂNTICA");
    console.log("=======================================================");
    
    const ids = products.map(p => `prod_${p.id}`);
    const documents = products.map(p => p.name);
    const metadatas = products.map(p => ({ id: p.id, category: p.category, price: p.price, color: p.color }));
    
    const embeddingsPromises = products.map(async (p) => {
        const productText = `Produto: ${p.name}. Categoria: ${p.category}. Cor: ${p.color}. Preço: R$ ${p.price}`;
        console.log(` 📝 [Catálogo] Prompt gerado para item ${p.id}: "${productText}"`);
        return await generateDenseEmbedding(productText);
    });
    
    const embeddings = await Promise.all(embeddingsPromises);
    await collection.add({ ids, embeddings, metadatas, documents });
    console.log("=======================================================\n✅ Sincronização concluída com sucesso!");
    return products.length;
}

app.post('/api/sync-database', async (req, res) => {
    try {
        const total = await syncChromaDB();
        res.json({ success: true, totalIndexed: total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/initial-data', (req, res) => {
    const currentUsers = loadUsersFromDisk();
    res.json({
        users: currentUsers.map(u => ({ id: u.id, name: u.name })),
        products: products.map(p => ({ id: p.id, name: p.name })),
        hasSavedModel: true
    });
});

app.get('/api/train-history', (req, res) => res.json(trainingLogs));

app.get('/api/recommendations/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        const currentUsers = loadUsersFromDisk();
        const user = currentUsers.find(u => u.id === userId);
        if (!user) return res.status(404).json({ error: "Usuário inválido" });

        const priceWeight = parseFloat(req.query.priceWeight) ?? 0.4;
        const textWeight = 1 - priceWeight;

        console.log(`\n🔍 [Recomendação] Calculando interesses para o cliente: ${user.name}`);

        const userQueryVector = await createUserProfileVector(user.purchases);

        let userAveragePrice = 0;
        if (user.purchases && user.purchases.length > 0) {
            const sumPrices = user.purchases.reduce((acc, p) => acc + p.price, 0);
            userAveragePrice = sumPrices / user.purchases.length;
        }

        let predictedTierName = "BASIC";
        if (userAveragePrice >= 130) predictedTierName = "PREMIUM";
        else if (userAveragePrice >= 70) predictedTierName = "MEDIUM";

        const searchResults = await collection.query({
            queryEmbeddings: [userQueryVector],
            nResults: 10
        });

        const purchasedIds = user.purchases.map(p => p.id);
        let candidatesList = [];

        // RESOLUÇÃO DO DESANINHAMENTO: ChromaDB devolve matrizes bidimensionais [0][i] para consultas batch
        // file: app.js - pesquisar por:  
        // Tratamento anti-NaN / anti-Null para o toFixed
        const ids = searchResults.ids[0] || [];
        const metadatas = searchResults.metadatas[0] || [];
        const documents = searchResults.documents[0] || [];
        const distances = searchResults.distances[0] || [];

        for (let i = 0; i < ids.length; i++) {
            const metadata = metadatas[i];
            const name = documents[i];
            const textDistance = distances[i] ?? 0;

            if (!metadata) continue;
            if (purchasedIds.includes(metadata.id)) continue;

            const priceDiff = Math.abs(metadata.price - userAveragePrice);
            const priceDistance = 1 - Math.exp(-priceDiff / 100);

            const finalHybridScore = (textWeight * textDistance) + (priceWeight * priceDistance);

            candidatesList.push({
                name,
                ...metadata,
                textDistance,
                priceDistance,
                distance: finalHybridScore
            });
        }

        candidatesList.sort((a, b) => a.distance - b.distance);
        const finalRecommendations = candidatesList.slice(0, 5);

        const confidenceMetrics = [
            { tier: "PESO TEXTO (LLM)", confidence: (textWeight * 100).toFixed(0) + '%' },
            { tier: "PESO PREÇO (NUM)", confidence: (priceWeight * 100).toFixed(0) + '%' }
        ];

        res.json({
            user: user.name,
            predictedTier: `${predictedTierName} (MÉDIA HISTÓRICA: R$ ${userAveragePrice.toFixed(2)})`,
            confidences: confidenceMetrics,
            purchases: user.purchases,
            recommendations: finalRecommendations
        });
    } catch (err) {
        console.error("Erro no re-ranqueamento híbrido:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/simulate-purchase', (req, res) => {
    try {
        const { userId, productId } = req.body;
        const currentUsers = loadUsersFromDisk();
        const user = currentUsers.find(u => u.id === parseInt(userId));
        const product = products.find(p => p.id === parseInt(productId));

        if (user && product) {
            if (!user.purchases.some(p => p.id === product.id)) {
                user.purchases.push(product);
                fs.writeFileSync(usersFilePath, JSON.stringify(currentUsers, null, 2));
                console.log(`🛒 [Simulação] Compra gravada: ${user.name} adquiriu "${product.name}"`);
            }
            res.json({ success: true });
        } else {
            res.status(400).json({ error: "Parâmetros inválidos" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

async function start() {
    await syncChromaDB();
    console.log("⚡ Pipeline híbrido e LLM local prontos para uso.");
    app.listen(3000, () => console.log("🚀 Sistema ativo em: http://localhost:3000"));
}

start().catch(console.error);
