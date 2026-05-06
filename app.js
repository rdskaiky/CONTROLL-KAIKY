// ======================= CONFIGURAÇÃO =======================
const WHATSAPP_NUMBER = "5531998771435";
const ITEMS_PER_PAGE = 12;
const USERS = {
    "daniel": "102030",
    "kaiky": "102030",
    "karen": "102030",
    "lidiane": "102030",
    "joaopedro": "102030"
};

// ======================= ESTADO GLOBAL =======================
let currentFilterType = "Todos";
let currentMachineFilter = "Todas";
let searchTerm = "";
let currentPage = 1;
let totalPages = 1;
let filteredData = [];
let currentModalItem = null;

// Scanner
let html5QrCode = null;
let scannerActive = false;
let scannerMode = "consulta";
let lastScannedCode = "";
let scanCooldown = false;

// ======================= INICIALIZAÇÃO =======================
function initApp() {
    if (!window.DATA || !window.DATA.estoque) {
        console.error("Dados nao carregados");
        return;
    }
    
    // Popular select maquinas
    const maquinasSet = new Set();
    window.DATA.estoque.forEach(item => {
        if (item.maquina && item.maquina.trim()) maquinasSet.add(item.maquina);
    });
    if (window.PREVENTIVAS) {
        window.PREVENTIVAS.forEach(p => {
            if (p.maquina && p.maquina.trim()) maquinasSet.add(p.maquina);
        });
    }
    const maquinasList = Array.from(maquinasSet).sort();
    
    const select = document.getElementById('machineSelect');
    select.innerHTML = '<option value="Todas">Todas</option>';
    maquinasList.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        select.appendChild(opt);
    });
    
    // Event listeners
    document.getElementById('mainSearch').addEventListener('input', onSearchInput);
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', onTabClick);
    });
    document.getElementById('pass').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    
    // Atalhos de teclado
    document.addEventListener('keydown', handleKeyboard);
    
    // Carregar tema salvo
    const savedTheme = localStorage.getItem('rds_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    
    updatePendentesCount();
    updatePreventivasCount();
    filterItems();
}

// ======================= TEMA =======================
function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('rds_theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.textContent = theme === 'light' ? 'dark_mode' : 'light_mode';
    }
}

// ======================= ATALHOS DE TECLADO =======================
function handleKeyboard(e) {
    // Ctrl+K = Busca
    if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        document.getElementById('mainSearch').focus();
    }
    // Ctrl+N = Nova NF
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        openNFModal();
    }
    // Ctrl+P = Pendentes
    if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        const pendentesTab = document.querySelector('[data-filter="PENDENTES"]');
        if (pendentesTab) pendentesTab.click();
    }
    // Ctrl+S = Saida
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        openSaidaModal();
    }
    // Ctrl+V = Preventivas
    if (e.ctrlKey && e.key === 'v') {
        e.preventDefault();
        const prevTab = document.querySelector('[data-filter="PREVENTIVAS"]');
        if (prevTab) prevTab.click();
    }
    // ESC = Fechar modais
    if (e.key === 'Escape') {
        closeModal();
        closeNFModal();
        closeSaidaModal();
        closeExportModal();
        stopScanner();
    }
}

// ======================= BUSCA =======================
function onSearchInput(e) {
    searchTerm = e.target.value;
    const btnClear = document.getElementById('btnClearSearch');
    if (btnClear) btnClear.classList.toggle('hidden', !searchTerm);
    currentPage = 1;
    filterItems();
}

function clearSearch() {
    document.getElementById('mainSearch').value = '';
    searchTerm = '';
    const btnClear = document.getElementById('btnClearSearch');
    if (btnClear) btnClear.classList.add('hidden');
    currentPage = 1;
    filterItems();
}

// ======================= TABS =======================
function onTabClick(e) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    currentFilterType = e.target.getAttribute('data-filter');
    currentPage = 1;
    filterItems();
}

function onMachineChange() {
    currentMachineFilter = document.getElementById('machineSelect').value;
    currentPage = 1;
    filterItems();
}

// ======================= STATUS =======================
function getStockStatus(item) {
    if (item.status === "PENDENTE" || item.qtd <= 0) return "out";
    if (item.estoqueMin && item.qtd <= item.estoqueMin) return "low";
    return "ok";
}

// ======================= FILTRAGEM =======================
function filterItems() {
    const preventivasGrid = document.getElementById('preventivasGrid');
    const productGrid = document.getElementById('productGrid');
    const pagination = document.getElementById('pagination');
    const empty = document.getElementById('emptyState');
    
    // Modo Preventivas
    if (currentFilterType === "PREVENTIVAS") {
        if (productGrid) productGrid.classList.add('hidden');
        if (preventivasGrid) preventivasGrid.classList.remove('hidden');
        if (pagination) pagination.classList.add('hidden');
        if (empty) empty.classList.add('hidden');
        renderPreventivas();
        updateStats();
        return;
    }
    
    // Modo Normal
    if (productGrid) productGrid.classList.remove('hidden');
    if (preventivasGrid) preventivasGrid.classList.add('hidden');
    
    let data = [...window.DATA.estoque];
    
    // Filtro por tipo
    if (currentFilterType === "PENDENTES") {
        data = data.filter(i => i.status === "PENDENTE" || i.qtd <= 0);
    } else if (currentFilterType !== "Todos") {
        data = data.filter(i => i.tipo === currentFilterType);
    }
    
    // Busca textual
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        data = data.filter(i =>
            i.cod1.toLowerCase().includes(term) ||
            i.desc.toLowerCase().includes(term) ||
            (i.maquina && i.maquina.toLowerCase().includes(term)) ||
            (i.local && i.local.toLowerCase().includes(term)) ||
            (i.cod2 && i.cod2.toLowerCase().includes(term)) ||
            (i.ean && i.ean.includes(term))
        );
    }
    
    // Filtro por maquina
    if (currentMachineFilter !== "Todas") {
        data = data.filter(i => i.maquina === currentMachineFilter);
    }
    
    // Ordenacao: zerados > baixo estoque > normais (alfabetico)
    data.sort((a, b) => {
        const order = { "out": 0, "low": 1, "ok": 2 };
        const sa = order[getStockStatus(a)];
        const sb = order[getStockStatus(b)];
        if (sa !== sb) return sa - sb;
        return a.desc.localeCompare(b.desc);
    });
    
    filteredData = data;
    totalPages = Math.ceil(data.length / ITEMS_PER_PAGE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    renderProducts();
    updateStats();
    updatePagination();
    updatePendentesCount();
    updatePreventivasCount();
}

// ======================= RENDERIZAÇÃO PRODUTOS =======================
function renderProducts() {
    const grid = document.getElementById('productGrid');
    const empty = document.getElementById('emptyState');
    
    if (!filteredData.length) {
        if (grid) grid.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    
    if (empty) empty.classList.add('hidden');
    
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const pageItems = filteredData.slice(start, start + ITEMS_PER_PAGE);
    
    if (grid) {
        grid.innerHTML = pageItems.map((item, idx) => {
            const status = getStockStatus(item);
            let cardClass = '', badgeClass = '', stockAlertHTML = '';
            
            if (status === 'out') {
                cardClass = 'out-stock';
                badgeClass = 'out';
                stockAlertHTML = '<span class="stock-alert danger">Zerado</span>';
            } else if (status === 'low') {
                cardClass = 'low-stock';
                badgeClass = 'low';
                stockAlertHTML = '<span class="stock-alert warning">Baixo</span>';
            }
            if (item.status === 'PENDENTE') cardClass += ' pending';
            
            const safeCode = item.cod1.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const imgSrc = item.imgUrl || `https://placehold.co/400x400/f0f4f9/94a3b8?text=${encodeURIComponent(item.cod1.substring(0,6))}`;
            
            return `<div class="card ${cardClass}" style="animation-delay:${idx*0.02}s" onclick="openItem('${safeCode}')">
                <div class="img-container">
                    <div class="badge-type">${item.tipo||'GERAL'}</div>
                    <div class="badge-qty ${badgeClass}">${item.qtd} un</div>
                    <img src="${imgSrc}" onerror="this.src='https://placehold.co/400x400/f0f4f9/94a3b8?text=Sem+imagem'" loading="lazy" alt="${item.desc}">
                </div>
                <div class="card-info">
                    <span class="card-aux">${item.cod2||'---'}</span>
                    <span class="card-code">${item.cod1}</span>
                    <p class="card-desc">${item.desc.substring(0, 32)}${item.desc.length>32?'...':''}</p>
                    <div class="card-footer">
                        <span class="loc-tag">${item.local||'N/I'}</span>
                        ${stockAlertHTML}
                    </div>
                </div>
            </div>`;
        }).join('');
    }
}

// ======================= RENDERIZAÇÃO PREVENTIVAS =======================
function renderPreventivas() {
    const grid = document.getElementById('preventivasGrid');
    const empty = document.getElementById('emptyState');
    
    if (!window.PREVENTIVAS || !window.PREVENTIVAS.length) {
        if (grid) grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-light);">Nenhuma preventiva cadastrada</div>';
        return;
    }
    
    let data = [...window.PREVENTIVAS];
    
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        data = data.filter(p =>
            p.descricao.toLowerCase().includes(term) ||
            p.maquina.toLowerCase().includes(term) ||
            p.id.toLowerCase().includes(term)
        );
    }
    
    if (currentMachineFilter !== "Todas") {
        data = data.filter(p => p.maquina === currentMachineFilter);
    }
    
    if (!data.length) {
        if (grid) grid.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    
    if (empty) empty.classList.add('hidden');
    
    if (grid) {
        grid.innerHTML = data.map(p => {
            let kitHTML = p.kits.map(kit => {
                let itensHTML = kit.itens.map(cod => {
                    const item = window.DATA.estoque.find(i => i.cod1 === cod);
                    const statusClass = item ? (item.qtd > 0 ? 'color:#10b981' : 'color:#ef4444') : 'color:#f59e0b';
                    const statusIcon = item ? (item.qtd > 0 ? 'check_circle' : 'cancel') : 'warning';
                    return `<div style="display:flex;align-items:center;gap:4px;font-size:11px;${statusClass}">
                        <i class="material-icons-round" style="font-size:14px;">${statusIcon}</i>
                        ${cod} ${item ? `(${item.qtd} un)` : '(nao encontrado)'}
                    </div>`;
                }).join('');
                return `<div class="preventiva-kit">
                    <strong style="font-size:12px;">${kit.desc}</strong>
                    ${itensHTML}
                </div>`;
            }).join('');
            
            return `<div class="preventiva-card">
                <div style="display:flex;justify-content:space-between;align-items:start;flex-wrap:wrap;gap:8px;">
                    <h3 style="color:var(--preventiva);">${p.id}</h3>
                    <span class="loc-tag" style="background:#ede9fe;color:var(--preventiva);">${p.maquina}</span>
                </div>
                <p style="font-weight:600;margin:8px 0;">${p.descricao}</p>
                <div class="preventiva-info">
                    <div><small style="color:var(--text-light);">Periodicidade:</small><br><strong>${p.periodicidade}</strong></div>
                    <div><small style="color:var(--text-light);">Duracao:</small><br><strong>${p.duracao}</strong></div>
                    <div><small style="color:var(--text-light);">Responsavel:</small><br><strong>${p.responsavel}</strong></div>
                </div>
                <div style="margin:12px 0;">
                    <strong style="font-size:13px;">Kits e Pecas:</strong>
                    ${kitHTML}
                </div>
                <div style="margin:12px 0;">
                    <strong style="font-size:13px;">Procedimentos:</strong>
                    <ol style="margin:8px 0 0 16px;font-size:12px;color:var(--text);">
                        ${p.procedimentos.map(proc => `<li>${proc}</li>`).join('')}
                    </ol>
                </div>
                ${p.observacoes ? `<div style="background:#fffbeb;padding:8px 12px;border-radius:8px;font-size:11px;color:#b45309;"><strong>Obs:</strong> ${p.observacoes}</div>` : ''}
                <button class="btn-login" style="background:var(--preventiva);margin-top:12px;" onclick="sharePreventiva('${p.id}')">
                    <i class="material-icons-round">share</i> Compartilhar Preventiva
                </button>
            </div>`;
        }).join('');
    }
}

function sharePreventiva(id) {
    const p = window.PREVENTIVAS.find(p => p.id === id);
    if (!p) return;
    const text = `*PREVENTIVA - ${p.id}*%0A%0A*Maquina:* ${p.maquina}%0A*Descricao:* ${p.descricao}%0A*Periodicidade:* ${p.periodicidade}%0A*Duracao:* ${p.duracao}%0A%0A*Kits:*%0A${p.kits.map(k => `- ${k.desc}: ${k.itens.join(', ')}`).join('%0A')}%0A%0A_Enviado via RDS.CONSULTA_`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, '_blank');
}

// ======================= STATS E CONTADORES =======================
function updateStats() {
    const statsBar = document.getElementById('statsBar');
    if (!statsBar) return;
    
    if (currentFilterType === "PREVENTIVAS") {
        const totalPrev = (window.PREVENTIVAS || []).length;
        statsBar.innerHTML = `<div class="stat-item">Preventivas: ${totalPrev} planos</div>`;
        return;
    }
    
    const total = window.DATA.estoque.length;
    const outStock = window.DATA.estoque.filter(i => i.qtd <= 0 || i.status === "PENDENTE").length;
    const lowStock = window.DATA.estoque.filter(i => i.qtd > 0 && i.estoqueMin && i.qtd <= i.estoqueMin && i.status !== "PENDENTE").length;
    
    statsBar.innerHTML = `
        <div class="stat-item">Total: ${total} itens</div>
        ${lowStock > 0 ? `<div class="stat-item warning">Baixo estoque: ${lowStock}</div>` : ''}
        ${outStock > 0 ? `<div class="stat-item danger">Zerados: ${outStock}</div>` : ''}
        ${searchTerm ? `<div class="stat-item">Resultados: ${filteredData.length}</div>` : ''}
    `;
}

function updatePendentesCount() {
    const count = window.DATA.estoque.filter(i => i.status === "PENDENTE" || i.qtd <= 0).length;
    const badge = document.getElementById('pendentesCount');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function updatePreventivasCount() {
    const count = (window.PREVENTIVAS || []).length;
    const badge = document.getElementById('preventivasCount');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

function updatePagination() {
    const pag = document.getElementById('pagination');
    if (!pag) return;
    
    if (totalPages <= 1) {
        pag.classList.add('hidden');
        return;
    }
    pag.classList.remove('hidden');
    
    const pageInfo = document.getElementById('pageInfo');
    if (pageInfo) pageInfo.textContent = `${currentPage} de ${totalPages}`;
    
    const buttons = pag.querySelectorAll('.btn-page');
    if (buttons[0]) buttons[0].disabled = currentPage === 1;
    if (buttons[1]) buttons[1].disabled = currentPage === totalPages;
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        renderProducts();
        updatePagination();
        window.scrollTo({ top: 300, behavior: 'smooth' });
    }
}

function nextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        renderProducts();
        updatePagination();
        window.scrollTo({ top: 300, behavior: 'smooth' });
    }
}

// ======================= SCANNER CÓDIGO DE BARRAS =======================
function startScanner(mode = "consulta") {
    scannerMode = mode;
    lastScannedCode = "";
    scanCooldown = false;
    
    document.getElementById('scannerModal').classList.add('active');
    document.getElementById('qr-reader-results').innerHTML = `
        <div style="text-align:center;padding:20px;">
            <i class="material-icons-round" style="font-size:40px;color:var(--primary-dark);animation:pulse 1.5s infinite;">qr_code_scanner</i>
            <p style="margin-top:12px;color:var(--text-light);">Aponte a camera para o codigo de barras</p>
            <p style="font-size:11px;color:var(--text-light);">EAN-13, EAN-8, Code 128, Code 39, QR Code, UPC</p>
        </div>`;
    
    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("qr-reader");
    }
    
    const config = {
        fps: 10,
        qrbox: { width: 280, height: 200 },
        aspectRatio: 1.0,
        formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.CODABAR
        ]
    };
    
    html5QrCode.start(
        { facingMode: "environment" },
        config,
        onScanSuccess,
        onScanError
    ).then(() => {
        scannerActive = true;
    }).catch(err => {
        let errorMsg = "Erro ao iniciar camera.";
        if (err.toString().includes("NotAllowedError")) {
            errorMsg = "Permissao de camera negada. Permita o acesso nas configuracoes.";
        } else if (err.toString().includes("NotFoundError")) {
            errorMsg = "Camera nao encontrada. Use um celular com camera.";
        }
        document.getElementById('qr-reader-results').innerHTML = `
            <div style="background:#fee2e2;padding:16px;border-radius:16px;text-align:center;">
                <i class="material-icons-round" style="font-size:40px;color:#ef4444;">error</i>
                <p style="color:#991b1b;margin-top:8px;">${errorMsg}</p>
            </div>`;
    });
}

function startScannerForSaida() {
    startScanner("saida");
}

function onScanSuccess(decodedText, decodedResult) {
    if (!scannerActive || scanCooldown) return;
    
    const scannedCode = decodedText.trim();
    
    if (scannedCode === lastScannedCode) return;
    lastScannedCode = scannedCode;
    scanCooldown = true;
    setTimeout(() => { scanCooldown = false; }, 2000);
    
    playBeep();
    
    let item = findItemByAnyCode(scannedCode);
    
    if (scannerMode === "saida") {
        document.getElementById('saidaCodigo').value = item ? item.cod1 : scannedCode;
        buscarItemSaida();
        stopScanner();
        return;
    }
    
    showScanResult(item, scannedCode);
}

function findItemByAnyCode(code) {
    // 1. Busca exata por EAN
    let item = window.DATA.estoque.find(i => i.ean === code);
    if (item) return item;
    
    // 2. Busca exata por cod1 (case insensitive)
    item = window.DATA.estoque.find(i => i.cod1.toLowerCase() === code.toLowerCase());
    if (item) return item;
    
    // 3. Busca exata por cod2
    item = window.DATA.estoque.find(i => i.cod2 === code);
    if (item) return item;
    
    // 4. Busca normalizada (sem espaços, traços, pontos, barras)
    const normalizedCode = code.replace(/[\s\-\.\/]/g, '').toLowerCase();
    item = window.DATA.estoque.find(i => {
        const normalizedCod1 = i.cod1.replace(/[\s\-\.\/]/g, '').toLowerCase();
        return normalizedCod1 === normalizedCode;
    });
    if (item) return item;
    
    // 5. Busca por EAN parcial (últimos dígitos)
    if (code.length >= 8) {
        const partialEAN = code.slice(-8);
        item = window.DATA.estoque.find(i => i.ean && i.ean.endsWith(partialEAN));
        if (item) return item;
    }
    
    // 6. Busca por CONTER o código
    item = window.DATA.estoque.find(i => 
        (i.ean && i.ean.includes(code)) ||
        i.cod1.toLowerCase().includes(code.toLowerCase()) ||
        (i.cod2 && i.cod2.includes(code))
    );
    if (item) return item;
    
    return null;
}

function showScanResult(item, scannedCode) {
    let resultHTML = '';
    
    if (item) {
        const statusColor = item.qtd > 0 ? '#10b981' : '#ef4444';
        const statusIcon = item.qtd > 0 ? 'check_circle' : 'error';
        const stockBadge = item.qtd <= (item.estoqueMin || 5) && item.qtd > 0 ? 'ESTOQUE BAIXO' : (item.qtd > 0 ? 'DISPONIVEL' : 'ESGOTADO');
        
        resultHTML = `
            <div style="background:#d1fae5;padding:20px;border-radius:20px;text-align:center;animation:scaleIn 0.3s ease;">
                <div style="background:white;width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
                    <i class="material-icons-round" style="font-size:36px;color:${statusColor};">${statusIcon}</i>
                </div>
                <h3 style="color:#065f46;margin-bottom:4px;">PRODUTO ENCONTRADO</h3>
                <p style="font-size:12px;color:#065f46;margin-bottom:12px;">Codigo: <strong>${scannedCode}</strong></p>
                <div style="background:white;border-radius:16px;padding:16px;text-align:left;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:var(--text-light);">Codigo:</span><strong>${item.cod1}</strong></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:var(--text-light);">Cod Aux:</span><strong>${item.cod2||'-'}</strong></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:var(--text-light);">Descricao:</span><strong>${item.desc}</strong></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:var(--text-light);">Maquina:</span><strong>${item.maquina||'Geral'}</strong></div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:var(--text-light);">Local:</span><strong style="color:var(--accent);">${item.local||'N/I'}</strong></div>
                    <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:2px solid #e5e7eb;"><span style="color:var(--text-light);">ESTOQUE:</span><strong style="font-size:20px;color:${statusColor};">${item.qtd} un</strong></div>
                    <div style="text-align:center;margin-top:12px;"><span style="background:${statusColor};color:white;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:800;">${stockBadge}</span></div>
                    ${item.status==='PENDENTE'?'<div style="text-align:center;margin-top:8px;"><span style="background:#6366f1;color:white;padding:4px 12px;border-radius:20px;font-size:11px;">PENDENTE</span></div>':''}
                </div>
                <div style="display:flex;gap:8px;margin-top:12px;">
                    <button class="btn-login" style="background:var(--primary-dark);flex:1;" onclick="stopScanner();openItem('${item.cod1.replace(/'/g,"\\'")}')">
                        <i class="material-icons-round">visibility</i> Detalhes
                    </button>
                    <button class="btn-login" style="background:#25d366;flex:1;" onclick="stopScanner();shareItemWhatsApp('${item.cod1.replace(/'/g,"\\'")}')">
                        <i class="material-icons-round">share</i> WhatsApp
                    </button>
                </div>
            </div>`;
    } else {
        resultHTML = `
            <div style="background:#fee2e2;padding:20px;border-radius:20px;text-align:center;animation:scaleIn 0.3s ease;">
                <div style="background:white;width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
                    <i class="material-icons-round" style="font-size:36px;color:#ef4444;">cancel</i>
                </div>
                <h3 style="color:#991b1b;margin-bottom:8px;">CODIGO NAO CADASTRADO</h3>
                <div style="background:white;border-radius:16px;padding:16px;">
                    <p style="color:var(--text-light);">Codigo escaneado:</p>
                    <p style="font-size:22px;font-weight:800;color:var(--primary-dark);">${scannedCode}</p>
                </div>
                <div style="display:flex;gap:8px;margin-top:12px;">
                    <button class="btn-login" style="background:var(--primary-dark);flex:1;" onclick="stopScanner();openNFModal()">
                        <i class="material-icons-round">receipt_long</i> Cadastrar NF
                    </button>
                    <button class="btn-login" style="background:#ef4444;flex:1;" onclick="stopScanner();document.getElementById('mainSearch').value='${scannedCode}';filterItems();">
                        <i class="material-icons-round">search</i> Buscar
                    </button>
                </div>
            </div>`;
    }
    
    document.getElementById('qr-reader-results').innerHTML = resultHTML;
    
    if (item) {
        setTimeout(() => stopScanner(), 3000);
    }
}

function shareItemWhatsApp(cod1) {
    const item = window.DATA.estoque.find(i => i.cod1 === cod1);
    if (!item) return;
    const text = `*RDS.CONSULTA*%0A%0A*Codigo:* ${item.cod1}%0A*Descricao:* ${item.desc}%0A*Local:* ${item.local||'N/I'}%0A*Estoque:* ${item.qtd} un%0A*Maquina:* ${item.maquina||'Geral'}%0A%0A_Escaneado via RDS.CONSULTA_`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, '_blank');
}

function onScanError(err) {
    // Ignorar erros normais de leitura
}

function stopScanner() {
    scannerActive = false;
    lastScannedCode = "";
    scanCooldown = false;
    document.getElementById('scannerModal').classList.remove('active');
    if (html5QrCode) {
        html5QrCode.stop().then(() => {}).catch(() => {});
    }
    document.getElementById('qr-reader-results').innerHTML = '';
}

function playBeep() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.value = 0.1;
        oscillator.start();
        setTimeout(() => { oscillator.stop(); audioContext.close(); }, 150);
    } catch (e) {}
}

// ======================= MODAL DETALHES =======================
function openItem(cod) {
    const item = window.DATA.estoque.find(i => i.cod1 === cod);
    if (!item) return;
    currentModalItem = item;
    
    const status = getStockStatus(item);
    const statusText = status === 'out' ? 'ESGOTADO' : status === 'low' ? 'ESTOQUE BAIXO' : 'Disponivel';
    const statusColor = status === 'out' ? 'var(--danger)' : status === 'low' ? 'var(--warning)' : 'var(--success)';
    
    document.getElementById('modalTitle').textContent = item.cod1;
    document.getElementById('modalData').innerHTML = `
        <div style="text-align:center">
            <img src="${item.imgUrl||'https://placehold.co/300x300/f0f4f9/94a3b8?text='+item.cod1}" 
                 style="width:140px;height:140px;border-radius:24px;object-fit:cover;margin-bottom:14px;background:#f0f4f9;"
                 onerror="this.src='https://placehold.co/300x300/f0f4f9/94a3b8?text=Imagem'">
            <p style="font-weight:700;font-size:16px;">${item.desc}</p>
            ${item.ean ? `<p style="font-size:11px;color:var(--text-light);">EAN: ${item.ean}</p>` : ''}
            <div style="background:#f8fafc;border-radius:20px;padding:16px;margin:16px 0;text-align:left;display:grid;gap:8px;">
                <div style="display:flex;justify-content:space-between;"><span>Codigo aux:</span><strong>${item.cod2||'-'}</strong></div>
                <div style="display:flex;justify-content:space-between;"><span>Maquina:</span><strong>${item.maquina||'Geral'}</strong></div>
                <div style="display:flex;justify-content:space-between;"><span>Local:</span><strong>${item.local||'N/I'}</strong></div>
                <div style="display:flex;justify-content:space-between;"><span>Estoque:</span><strong>${item.qtd} un</strong></div>
                <div style="display:flex;justify-content:space-between;"><span>Minimo:</span><strong>${item.estoqueMin||'-'}</strong></div>
                <div style="display:flex;justify-content:space-between;"><span>Tipo:</span><strong>${item.tipo||'-'}</strong></div>
                <div style="text-align:center;margin-top:6px;font-weight:700;color:${statusColor};">${statusText}</div>
            </div>
        </div>`;
    
    document.getElementById('itemModal').classList.add('active');
}

function closeModal() {
    document.getElementById('itemModal').classList.remove('active');
    currentModalItem = null;
}

function shareViaWhatsApp() {
    if (!currentModalItem) return;
    const item = currentModalItem;
    const text = `*RDS.CONSULTA*%0A%0A*Codigo:* ${item.cod1}%0A*Descricao:* ${item.desc}%0A*Maquina:* ${item.maquina||'Geral'}%0A*Local:* ${item.local||'N/I'}%0A*Estoque:* ${item.qtd} un%0A%0A_Consultado via RDS.CONSULTA_`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${text}`, '_blank');
}

// ======================= SAÍDA DE MATERIAL =======================
function buscarItemSaida() {
    const codigo = document.getElementById('saidaCodigo').value.trim();
    const infoDiv = document.getElementById('saidaItemInfo');
    if (!codigo) {
        infoDiv.innerHTML = '';
        return;
    }
    
    const item = window.DATA.estoque.find(i => 
        i.cod1.toLowerCase() === codigo.toLowerCase() || 
        i.ean === codigo ||
        i.cod2 === codigo
    );
    
    if (item) {
        infoDiv.innerHTML = `
            <div style="background:#d1fae5;padding:8px 12px;border-radius:12px;">
                <strong>${item.desc}</strong><br>
                <small>Estoque: ${item.qtd} un | Local: ${item.local}</small>
            </div>`;
    } else {
        infoDiv.innerHTML = `
            <div style="background:#fee2e2;padding:8px 12px;border-radius:12px;">
                <strong>Item nao encontrado</strong>
            </div>`;
    }
}

function openSaidaModal() {
    document.getElementById('saidaModal').classList.add('active');
    document.getElementById('saidaForm').reset();
    document.getElementById('saidaItemInfo').innerHTML = '';
    scannerMode = "saida";
}

function closeSaidaModal() {
    document.getElementById('saidaModal').classList.remove('active');
}

function submitSaida(e) {
    e.preventDefault();
    
    const codigo = document.getElementById('saidaCodigo').value.trim();
    const quantidade = parseInt(document.getElementById('saidaQuantidade').value);
    const os = document.getElementById('saidaOS').value;
    const responsavel = document.getElementById('saidaResponsavel').value;
    const obs = document.getElementById('saidaObs').value;
    
    const item = window.DATA.estoque.find(i => 
        i.cod1.toLowerCase() === codigo.toLowerCase() || 
        i.ean === codigo ||
        i.cod2 === codigo
    );
    
    if (!item) {
        alert('Item nao encontrado!');
        return;
    }
    
    if (quantidade > item.qtd) {
        alert(`Estoque insuficiente! Disponivel: ${item.qtd} unidades.`);
        return;
    }
    
    item.qtd -= quantidade;
    
    window.DATA.historicoMov.unshift({
        data: new Date().toLocaleString('pt-BR'),
        tipo: "SAIDA",
        material: item.desc,
        codigo: item.cod1,
        qtd: quantidade,
        maquina: item.maquina,
        responsavel: `${responsavel}${os ? ' / OS:' + os : ''}`,
        obs: obs
    });
    
    const message = `*SAIDA DE MATERIAL*%0A%0A*Codigo:* ${item.cod1}%0A*Material:* ${item.desc}%0A*Quantidade:* ${quantidade} un%0A*Local:* ${item.local}%0A*Responsavel:* ${responsavel}%0A${os ? '*OS:* ' + os + '%0A' : ''}*Estoque restante:* ${item.qtd} un%0A%0A_RDS.CONSULTA_`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank');
    
    closeSaidaModal();
    filterItems();
    alert(`Saida registrada! Estoque atualizado: ${item.qtd} unidades restantes.`);
}

// ======================= NOTA FISCAL =======================
function openNFModal() {
    document.getElementById('nfModal').classList.add('active');
}

function closeNFModal() {
    document.getElementById('nfModal').classList.remove('active');
    document.getElementById('nfForm').reset();
}

function submitNF(e) {
    e.preventDefault();
    
    const nf = {
        numero: document.getElementById('nfNumero').value,
        fornecedor: document.getElementById('nfFornecedor').value,
        codigo: document.getElementById('nfCodigo').value,
        descricao: document.getElementById('nfDescricao').value,
        quantidade: document.getElementById('nfQuantidade').value,
        local: document.getElementById('nfLocal').value,
        maquina: document.getElementById('nfMaquina').value,
        obs: document.getElementById('nfObs').value,
        data: new Date().toLocaleString('pt-BR')
    };
    
    const message = `*ENTRADA DE NOTA FISCAL*%0A%0A*NF:* ${nf.numero}%0A*Fornecedor:* ${nf.fornecedor}%0A*Codigo:* ${nf.codigo}%0A*Material:* ${nf.descricao}%0A*Qtd:* ${nf.quantidade}%0A*Local:* ${nf.local}%0A*Maquina:* ${nf.maquina}%0A*Data:* ${nf.data}%0A${nf.obs ? '*Obs:* ' + nf.obs + '%0A' : ''}%0A_RDS.CONSULTA_`;
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank');
    
    window.DATA.historicoMov.unshift({
        data: nf.data,
        tipo: "ENTRADA NF",
        material: nf.descricao,
        qtd: parseInt(nf.quantidade),
        maquina: nf.maquina,
        responsavel: "NF: " + nf.numero
    });
    
    closeNFModal();
    alert('Entrada de NF enviada com sucesso!');
}

// ======================= EXPORTAÇÃO =======================
function showExportMenu() {
    document.getElementById('exportModal').classList.add('active');
}

function closeExportModal() {
    document.getElementById('exportModal').classList.remove('active');
}

function exportToExcel() {
    const data = window.DATA.estoque.map(item => ({
        'Codigo': item.cod1,
        'Cod Aux': item.cod2 || '',
        'EAN': item.ean || '',
        'Descricao': item.desc,
        'Tipo': item.tipo || '',
        'Maquina': item.maquina || '',
        'Quantidade': item.qtd,
        'Local': item.local || '',
        'Estoque Min': item.estoqueMin || '',
        'Status': item.status || (item.qtd <= 0 ? 'ZERADO' : 'OK')
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Estoque");
    XLSX.writeFile(wb, `rds_estoque_${new Date().toISOString().split('T')[0]}.xlsx`);
    closeExportModal();
}

function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(16);
    doc.text('RDS.CONSULTA - Relatorio de Estoque', 14, 20);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 28);
    
    const data = window.DATA.estoque.map(item => [
        item.cod1,
        item.desc.substring(0, 30),
        item.qtd,
        item.local || '',
        item.maquina || ''
    ]);
    
    doc.autoTable({
        head: [['Codigo', 'Descricao', 'Qtd', 'Local', 'Maquina']],
        body: data,
        startY: 32,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 111, 143] }
    });
    
    doc.save(`rds_estoque_${new Date().toISOString().split('T')[0]}.pdf`);
    closeExportModal();
}

function exportToJSON() {
    const exportObj = {
        data: new Date().toISOString(),
        total: window.DATA.estoque.length,
        estoque: window.DATA.estoque,
        preventivas: window.PREVENTIVAS || [],
        historico: window.DATA.historicoMov || []
    };
    const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rds_full_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    closeExportModal();
}

// ======================= LOGIN / LOGOUT =======================
function handleLogin() {
    const user = document.getElementById('user').value.toLowerCase().trim();
    const pass = document.getElementById('pass').value;
    
    if (USERS[user] === pass) {
        document.getElementById('login-screen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
            initApp();
        }, 350);
    } else {
        alert('Acesso negado! Verifique usuario e senha.');
    }
}

function handleLogout() {
    if (confirm('Deseja sair do sistema?')) {
        stopScanner();
        document.getElementById('app').classList.add('hidden');
        document.getElementById('login-screen').style.opacity = '1';
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('user').value = '';
        document.getElementById('pass').value = '';
    }
}

// ======================= EXPORTAÇÃO GLOBAL =======================
window.openItem = openItem;
window.closeModal = closeModal;
window.openNFModal = openNFModal;
window.closeNFModal = closeNFModal;
window.submitNF = submitNF;
window.openSaidaModal = openSaidaModal;
window.closeSaidaModal = closeSaidaModal;
window.submitSaida = submitSaida;
window.buscarItemSaida = buscarItemSaida;
window.shareViaWhatsApp = shareViaWhatsApp;
window.shareItemWhatsApp = shareItemWhatsApp;
window.sharePreventiva = sharePreventiva;
window.showExportMenu = showExportMenu;
window.closeExportModal = closeExportModal;
window.exportToExcel = exportToExcel;
window.exportToPDF = exportToPDF;
window.exportToJSON = exportToJSON;
window.toggleTheme = toggleTheme;
window.startScanner = startScanner;
window.startScannerForSaida = startScannerForSaida;
window.stopScanner = stopScanner;
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.clearSearch = clearSearch;
window.prevPage = prevPage;
window.nextPage = nextPage;
window.onMachineChange = onMachineChange;
