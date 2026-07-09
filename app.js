const userSelect = document.getElementById('userSelect');
const productSelect = document.getElementById('productSelect');
const buyBtn = document.getElementById('buyBtn');
const dbBtn = document.getElementById('dbBtn');
const priceWeightSlider = document.getElementById('priceWeightSlider');
const weightValue = document.getElementById('weightValue');

async function initPage() {
    const res = await fetch('/api/initial-data');
    const data = await res.json();
    
    data.users.forEach(u => {
        const opt = document.createElement('option'); opt.value = u.id; opt.innerText = u.name;
        userSelect.appendChild(opt);
    });

    data.products.forEach(p => {
        const opt = document.createElement('option'); opt.value = p.id; opt.innerText = p.name;
        productSelect.appendChild(opt);
    });

    userSelect.addEventListener('change', (e) => onUserChange(e.target.value));
    buyBtn.addEventListener('click', submitSimulatedPurchase);
    dbBtn.addEventListener('click', executeDBSync);

    priceWeightSlider.addEventListener('input', (e) => {
        const percentage = Math.round(e.target.value * 100);
        weightValue.innerText = `${percentage}%`;
        if (userSelect.value) loadDashboard(userSelect.value);
    });
}

function onUserChange(userId) {
    const hasUser = userId !== "";
    productSelect.disabled = !hasUser;
    buyBtn.disabled = !hasUser;
    if (hasUser) loadDashboard(userId);
}

async function executeDBSync() {
    dbBtn.disabled = true;
    const oldText = dbBtn.innerText;
    dbBtn.innerText = "⏳ Sincronizando...";
    
    const res = await fetch('/api/sync-database', { method: 'POST' });
    const data = await res.json();
    
    if(data.success) {
        dbBtn.innerText = oldText;
        if (userSelect.value) loadDashboard(userSelect.value);
    }
}

async function loadDashboard(userId) {
    const currentWeight = priceWeightSlider.value;
    const res = await fetch(`/api/recommendations/${userId}?priceWeight=${currentWeight}`);
    const data = await res.json();

    // Renderização do histórico de compras
    let pList = '';
    data.purchases.forEach(p => {
        pList += `<div class="card purchase-card"><strong>${p.name}</strong><br><span class="badge">${p.category}</span><span class="badge">${p.color}</span><div style="margin-top:6px; color:#28a745; font-weight:bold;">R$ ${p.price}</div></div>`;
    });
    document.getElementById('purchasesList').innerHTML = pList || 'Sem histórico.';

    // Como eu adicionei um Slider com as metricas de peso.
    // Tem que renderizar as métricas de peso configuradas pelo Slider
    let confidenceHtml = '';
    data.confidences.forEach(c => {
        confidenceHtml += `<span class="badge" style="background: #edf2f7; color: #4a5568;">${c.tier}: ${c.confidence}</span> `;
    });

    let rList = `
        <div class="card neural-card" style="border-left-color: #9f7aea; background: #faf5ff;">
            <strong>Equilíbrio da Busca Híbrida Semântica:</strong>
            <div style="margin-top: 8px; margin-bottom: 5px;">${confidenceHtml}</div>
            <p style="margin: 8px 0 0 0; font-size: 13px; font-weight: bold; color: #6b46c1;">
                🎯 Perfil Estimado do Cliente: ${data.predictedTier}
            </p>
        </div>
        <h4 style="margin: 20px 0 10px 0; color: #4a5568;">Sugestões do Catálogo no ChromaDB:</h4>
    `;

    // Tratamento anti-NaN / anti-Null para o toFixed
    data.recommendations.forEach(r => {
        //  Se r.distance for null, undefined ou 0, assume 0 
        //  Este tratamento foi feito pois a primeira vez que executei  o código, 
        //  os valores do produto apareceram como undefined e o score final  era sempre  0.
        //  Pesquisando , descobri que  o ChromaDB retorna os dados estruturados dentro de arrays aninhados (matrizes) nas consultas em batch.
        //  Como os metadatas vinham vazios (undefined), o backend não conseguia calcular a distância de preço e gerava um cálculo inválido (NaN).
        //  Substituido  searchResults.metadatas[i] por searchResults.metadatas[0][i]. 
        //  file: server.js
        const safeDistance = r.distance ?? 0;

        rList += `
        <div class="card recom-card" style="border-left-color: #007bff;">
            <strong>${r.name}</strong><br>
            <span class="badge">${r.category}</span><span class="badge">${r.color}</span>
            <span class="badge" style="background: #ebf8ff; color: #2b6cb0;">R$ ${r.price}</span>
            <div style="margin-top:8px; font-size: 11px; color:#718096; font-weight:bold;">
                Score Combinado Ponderado (Distância Final): ${safeDistance.toFixed(4)}
            </div>
        </div>`;
    });
    
    document.getElementById('recommendationsList').innerHTML = rList || 'Sem recomendações.';
}

async function submitSimulatedPurchase() {
    const userId = userSelect.value;
    const productId = productSelect.value;
    if (!productId) return alert('Selecione um produto!');

    await fetch('/api/simulate-purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, productId })
    });

    dbBtn.disabled = false;
    loadDashboard(userId);
}

// Inicializa a página
initPage();
