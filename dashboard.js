(function () {
    "use strict";

    const DATA_FILES = {
        ciclo2: "Ciclo2.csv",
        ciclo3: "Ciclo3.csv",
        fluxo: "Fluxo.csv",
        geral: "Geral.csv"
    };

    const CAPEX_COL_MAP = {
        ufv: "ufv",
        natureza: "natureza",
        fornecedor: "fornecedor",
        contratooriginal: "contrato_original",
        valortotal: "valor_total",
        fdmedido: "fd_medido",
        medicao: "medicao",
        fdmedicao: "fd_medicao",
        saldoamedir: "saldo_a_medir",
        avancocontratual: "avanco_contratual",
        avancoobra: "avanco_obra",
        portfolio: "portfolio",
        portifolio: "portfolio"
    };

    const FIN_COL_MAP = {
        usinafilial: "ufv_pag",
        usina: "ufv_pag",
        filial: "ufv_pag",
        valordanf: "valor_nf",
        fornecedor: "fornecedor_pag",
        statusdolancamento: "status_pag",
        dataemissaonf: "data_emissao_nf",
        nodanf: "numero_nf"
    };

    const ALL_UFV_KEY = "__ALL_UFV__";

    const state = {
        data: {
            capex: [],
            financeiro: [],
            fluxo: []
        },
        selectedUfvKey: ALL_UFV_KEY,
        ufvLabelByKey: {},
        searchText: "",
        errors: [],
        sort: {
            key: "valor_total",
            dir: "desc"
        },
        page: 1,
        pageSize: 25
    };

    function byId(id) {
        return document.getElementById(id);
    }

    function normalizeColName(value) {
        return String(value || "")
            .trim()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "");
    }

    function safeText(value) {
        if (value === null || value === undefined) return "";
        return String(value).trim();
    }

    function safeUpper(value) {
        return safeText(value).toUpperCase();
    }

    function normalizeUfvKey(value) {
        return safeText(value)
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    function toTitleCasePt(value) {
        if (!value) return "";
        return value
            .toLowerCase()
            .replace(/(^|[\s-])([a-zà-ÿ])/g, (match, p1, p2) => `${p1}${p2.toUpperCase()}`)
            .replace(/\bUfv\b/g, "UFV");
    }

    function cleanUfvLabel(value) {
        const raw = safeText(value).replace(/\s*-\s*/g, " - ").replace(/\s+/g, " ").trim();
        if (!raw) return "";
        if (raw === raw.toUpperCase()) return toTitleCasePt(raw);
        return raw;
    }

    function toNumber(value) {
        if (value === null || value === undefined) return 0;
        let raw = String(value).trim();
        if (!raw || raw === "-") return 0;

        raw = raw.replace(/[R$\s]/g, "");
        raw = raw.replace(/[^\d,.\-]/g, "");

        const hasComma = raw.includes(",");
        const hasDot = raw.includes(".");

        if (hasComma && hasDot) {
            if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) {
                raw = raw.replace(/\./g, "").replace(",", ".");
            } else {
                raw = raw.replace(/,/g, "");
            }
        } else if (hasComma) {
            raw = raw.replace(/\./g, "").replace(",", ".");
        }

        const n = Number(raw);
        return Number.isFinite(n) ? n : 0;
    }

    function escapeHtml(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatCurrency(value) {
        const n = Number.isFinite(value) ? value : 0;
        return n.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
    }

    function formatPercent(value) {
        const n = Number.isFinite(value) ? value : 0;
        return `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    }

    function pctFromSeries(values) {
        const nums = values.filter((v) => Number.isFinite(v));
        if (!nums.length) return 0;
        const max = Math.max(...nums);
        const avg = nums.reduce((sum, v) => sum + v, 0) / nums.length;
        return max <= 1.5 ? avg * 100 : avg;
    }

    function mapRowByColumns(row, mapRef) {
        const mapped = {};
        for (const [col, value] of Object.entries(row || {})) {
            const key = normalizeColName(col);
            if (!key || key.startsWith("unnamed")) continue;
            const target = mapRef[key];
            if (target) mapped[target] = value;
        }
        return mapped;
    }

    function standardizeCapexRows(rows, ciclo) {
        const out = [];
        for (const row of rows || []) {
            const mapped = mapRowByColumns(row, CAPEX_COL_MAP);
            if (!Object.keys(mapped).length) continue;

            const rec = {
                ciclo: ciclo,
                ufv_raw: safeText(mapped.ufv),
                ufv_key: normalizeUfvKey(mapped.ufv),
                ufv: safeUpper(mapped.ufv),
                natureza: safeText(mapped.natureza),
                fornecedor: safeText(mapped.fornecedor),
                contrato_original: toNumber(mapped.contrato_original),
                valor_total: toNumber(mapped.valor_total),
                fd_medido: toNumber(mapped.fd_medido),
                medicao: toNumber(mapped.medicao),
                fd_medicao: toNumber(mapped.fd_medicao),
                saldo_a_medir: toNumber(mapped.saldo_a_medir),
                avanco_contratual: toNumber(mapped.avanco_contratual),
                avanco_obra: toNumber(mapped.avanco_obra),
                portfolio: safeText(mapped.portfolio)
            };

            if (!rec.fd_medicao) {
                rec.fd_medicao = rec.fd_medido + rec.medicao;
            }

            out.push(rec);
        }
        return out;
    }

    function standardizeFinRows(rows) {
        const out = [];
        for (const row of rows || []) {
            const mapped = mapRowByColumns(row, FIN_COL_MAP);
            if (!Object.keys(mapped).length) continue;
            out.push({
                ufv_pag_raw: safeText(mapped.ufv_pag),
                ufv_key: normalizeUfvKey(mapped.ufv_pag),
                ufv_pag: safeUpper(mapped.ufv_pag),
                fornecedor_pag: safeText(mapped.fornecedor_pag),
                status_pag: safeText(mapped.status_pag),
                valor_nf: toNumber(mapped.valor_nf),
                data_emissao_nf: safeText(mapped.data_emissao_nf),
                numero_nf: safeText(mapped.numero_nf)
            });
        }
        return out;
    }

    function buildUfvLabelMap(capexRows, finRows) {
        const byKey = new Map();

        function pushVariant(key, raw, source) {
            if (!key) return;
            const labelRaw = cleanUfvLabel(raw) || key;
            if (!byKey.has(key)) {
                byKey.set(key, new Map());
            }
            const variants = byKey.get(key);
            const existing = variants.get(labelRaw) || { label: labelRaw, total: 0, capex: 0, fin: 0 };
            existing.total += 1;
            if (source === "capex") existing.capex += 1;
            if (source === "fin") existing.fin += 1;
            variants.set(labelRaw, existing);
        }

        for (const row of capexRows) {
            pushVariant(row.ufv_key, row.ufv_raw || row.ufv, "capex");
        }
        for (const row of finRows) {
            pushVariant(row.ufv_key, row.ufv_pag_raw || row.ufv_pag, "fin");
        }

        const labelByKey = {};
        for (const [key, variantsMap] of byKey.entries()) {
            const best = Array.from(variantsMap.values()).sort((a, b) => {
                if (b.capex !== a.capex) return b.capex - a.capex;
                if (b.total !== a.total) return b.total - a.total;
                return a.label.localeCompare(b.label, "pt-BR");
            })[0];
            labelByKey[key] = best ? best.label : key;
        }
        return labelByKey;
    }

    function applyUfvLabels() {
        const labelByKey = state.ufvLabelByKey || {};
        for (const row of state.data.capex) {
            row.ufv_label = labelByKey[row.ufv_key] || cleanUfvLabel(row.ufv_raw || row.ufv) || row.ufv_key;
        }
        for (const row of state.data.financeiro) {
            row.ufv_pag_label = labelByKey[row.ufv_key] || cleanUfvLabel(row.ufv_pag_raw || row.ufv_pag) || row.ufv_key;
        }
    }

    function normalizeFluxoRows(rows) {
        if (!rows || !rows.length) return [];

        const first = rows[0];
        const monthCols = Object.keys(first).filter((col) => normalizeColName(col).startsWith("mes"));
        if (!monthCols.length) return [];

        const out = [];
        for (const row of rows) {
            for (const mes of monthCols) {
                out.push({
                    mes: safeText(mes),
                    valor: toNumber(row[mes])
                });
            }
        }
        return out;
    }

    function mesSortValue(mes) {
        const match = String(mes).match(/(\d+)/);
        return match ? Number(match[1]) : 9999;
    }

    async function loadCsv(path) {
        const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`Falha ao carregar ${path} (HTTP ${response.status})`);
        }
        const text = await response.text();
        const parsed = Papa.parse(text, {
            header: true,
            skipEmptyLines: true
        });

        const parseErrors = (parsed.errors || [])
            .filter((e) => e && e.code !== "UndetectableDelimiter")
            .map((e) => `${path}: ${e.message}`);

        return {
            rows: parsed.data || [],
            lastModified: response.headers.get("last-modified"),
            parseErrors: parseErrors
        };
    }

    function setStatus(text, isError) {
        const el = byId("statusCarregamento");
        if (!el) return;
        el.textContent = text;
        el.className = `text-xs mt-2 flex items-center gap-2 ${isError ? "text-red-300" : "text-gray-300"}`;
    }

    function updateTimestamp(dates) {
        const target = byId("ultimaAtualizacao");
        if (!target) return;
        const valid = dates.filter(Boolean).map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()));
        if (!valid.length) {
            const now = new Date();
            target.textContent = `Ultima atualizacao: ${now.toLocaleString("pt-BR")}`;
            return;
        }
        const latest = new Date(Math.max(...valid.map((d) => d.getTime())));
        target.textContent = `Ultima atualizacao: ${latest.toLocaleString("pt-BR")}`;
    }

    function showAlerts(errors) {
        const section = byId("alertSection");
        const list = byId("alertList");
        if (!section || !list) return;
        if (!errors.length) {
            section.classList.add("hidden");
            list.innerHTML = "";
            return;
        }
        section.classList.remove("hidden");
        list.innerHTML = errors.map((err) => `<li>${escapeHtml(err)}</li>`).join("");
    }

    function fillUfvFilter() {
        const select = byId("filtroUfv");
        if (!select) return;

        const ufvSet = new Set();
        for (const row of state.data.capex) {
            if (row.ufv_key) ufvSet.add(row.ufv_key);
        }
        for (const row of state.data.financeiro) {
            if (row.ufv_key) ufvSet.add(row.ufv_key);
        }

        const keys = Array.from(ufvSet).sort((a, b) => {
            const la = state.ufvLabelByKey[a] || a;
            const lb = state.ufvLabelByKey[b] || b;
            return la.localeCompare(lb, "pt-BR");
        });

        const options = [{ key: ALL_UFV_KEY, label: "Todas" }, ...keys.map((key) => ({
            key: key,
            label: state.ufvLabelByKey[key] || key
        }))];

        select.innerHTML = options
            .map((opt) => `<option value="${escapeHtml(opt.key)}">${escapeHtml(opt.label)}</option>`)
            .join("");
        select.value = state.selectedUfvKey;
    }

    function getFilteredData() {
        const ufvKey = state.selectedUfvKey;
        const q = state.searchText;
        const allSelected = ufvKey === ALL_UFV_KEY;

        const capexRows = state.data.capex.filter((row) => {
            const ufvMatch = allSelected || row.ufv_key === ufvKey;
            if (!ufvMatch) return false;

            if (!q) return true;
            const hay = `${row.ufv_label || row.ufv} ${row.natureza} ${row.fornecedor} ${row.ciclo}`.toLowerCase();
            return hay.includes(q);
        });

        const finRows = state.data.financeiro.filter((row) => {
            if (allSelected) return true;
            return row.ufv_key === ufvKey;
        });

        return {
            capexRows: capexRows,
            finRows: finRows
        };
    }

    function calculateMetrics(capexRows, finRows) {
        const totalContratado = capexRows.reduce((sum, row) => sum + row.valor_total, 0);
        const totalMedido = capexRows.reduce((sum, row) => sum + row.fd_medicao, 0);
        const totalPago = finRows.reduce((sum, row) => sum + row.valor_nf, 0);
        const saldo = capexRows.reduce((sum, row) => sum + row.saldo_a_medir, 0);
        const avanco = pctFromSeries(capexRows.map((row) => row.avanco_obra));

        return {
            totalContratado: totalContratado,
            totalMedido: totalMedido,
            totalPago: totalPago,
            saldo: saldo,
            avanco: avanco
        };
    }

    function renderKpis(metrics) {
        byId("kpiContratado").textContent = formatCurrency(metrics.totalContratado);
        byId("kpiMedido").textContent = formatCurrency(metrics.totalMedido);
        byId("kpiPago").textContent = formatCurrency(metrics.totalPago);
        byId("kpiSaldo").textContent = formatCurrency(metrics.saldo);

        const dif = metrics.totalPago - metrics.totalMedido;
        byId("kpiDif").textContent = `Dif: ${formatCurrency(dif)}`;
        byId("kpiDif").className = `text-[11px] mt-2 ${dif >= 0 ? "text-green-300" : "text-amber-300"}`;
    }

    function plotCommonLayout() {
        return {
            margin: { t: 20, r: 20, b: 50, l: 55 },
            paper_bgcolor: "#212121",
            plot_bgcolor: "#212121",
            font: { color: "#F4F4F4", family: "Montserrat, sans-serif" },
            xaxis: { gridcolor: "#333", zerolinecolor: "#333" },
            yaxis: { gridcolor: "#333", zerolinecolor: "#333" }
        };
    }

    function renderComparativoChart(metrics) {
        const data = [{
            type: "bar",
            x: ["Contratado", "Medido", "Pago"],
            y: [metrics.totalContratado, metrics.totalMedido, metrics.totalPago],
            marker: {
                color: ["#64748b", "#3b82f6", "#22c55e"],
                line: { color: "#111", width: 1 }
            },
            text: [metrics.totalContratado, metrics.totalMedido, metrics.totalPago].map(formatCurrency),
            textposition: "outside",
            hovertemplate: "%{x}<br>%{text}<extra></extra>"
        }];

        const layout = plotCommonLayout();
        layout.yaxis.tickprefix = "R$ ";

        Plotly.newPlot("chartComparativo", data, layout, {
            displayModeBar: false,
            responsive: true
        });
    }

    function renderGauge(metrics) {
        const data = [{
            type: "indicator",
            mode: "gauge+number",
            value: metrics.avanco,
            number: { suffix: "%", font: { color: "#F4F4F4" } },
            gauge: {
                axis: { range: [0, 100], tickcolor: "#a3a3a3" },
                bar: { color: "#AECC56" },
                bgcolor: "#2a2a2a",
                bordercolor: "#3a3a3a",
                borderwidth: 1
            }
        }];

        const layout = {
            margin: { t: 30, r: 20, b: 20, l: 20 },
            paper_bgcolor: "#212121",
            font: { color: "#F4F4F4", family: "Montserrat, sans-serif" }
        };

        Plotly.newPlot("chartGauge", data, layout, {
            displayModeBar: false,
            responsive: true
        });
    }

    function renderFluxoChart() {
        const section = byId("fluxoSection");
        if (!section) return;

        if (state.selectedUfvKey !== ALL_UFV_KEY || !state.data.fluxo.length) {
            section.classList.add("hidden");
            return;
        }

        const sumByMes = new Map();
        for (const row of state.data.fluxo) {
            const key = row.mes || "Mes";
            const current = sumByMes.get(key) || 0;
            sumByMes.set(key, current + row.valor);
        }

        const ordered = Array.from(sumByMes.entries()).sort((a, b) => mesSortValue(a[0]) - mesSortValue(b[0]));
        const x = ordered.map((item) => item[0]);
        const y = ordered.map((item) => item[1]);

        const data = [{
            type: "scatter",
            mode: "lines+markers",
            x: x,
            y: y,
            line: { color: "#AECC56", width: 3 },
            marker: { size: 7, color: "#60AB56" },
            hovertemplate: "%{x}<br>" + "%{y:,.2f}<extra></extra>"
        }];

        const layout = plotCommonLayout();
        layout.margin = { t: 20, r: 20, b: 50, l: 60 };
        layout.yaxis.tickprefix = "R$ ";

        Plotly.newPlot("chartFluxo", data, layout, {
            displayModeBar: false,
            responsive: true
        });
        section.classList.remove("hidden");
    }

    function getSortedRows(rows) {
        const { key, dir } = state.sort;
        const factor = dir === "asc" ? 1 : -1;

        return [...rows].sort((a, b) => {
            const va = a[key];
            const vb = b[key];

            const na = Number(va);
            const nb = Number(vb);
            const bothNumbers = Number.isFinite(na) && Number.isFinite(nb);
            if (bothNumbers) {
                return (na - nb) * factor;
            }
            return String(va || "").localeCompare(String(vb || ""), "pt-BR") * factor;
        });
    }

    function avancoDisplay(value) {
        if (!Number.isFinite(value)) return 0;
        return value <= 1.5 ? value * 100 : value;
    }

    function renderSortIndicators() {
        document.querySelectorAll("[data-sort-icon]").forEach((el) => {
            const key = el.getAttribute("data-sort-icon");
            if (key === state.sort.key) {
                el.textContent = state.sort.dir === "asc" ? " ▲" : " ▼";
            } else {
                el.textContent = "";
            }
        });
    }

    function renderTable(rows) {
        const body = byId("tableBody");
        const info = byId("tableInfo");
        const pageLabel = byId("pageLabel");
        const prev = byId("prevPage");
        const next = byId("nextPage");

        const sorted = getSortedRows(rows);
        const total = sorted.length;
        const totalPages = Math.max(1, Math.ceil(total / state.pageSize));

        if (state.page > totalPages) state.page = totalPages;
        if (state.page < 1) state.page = 1;

        const start = (state.page - 1) * state.pageSize;
        const end = Math.min(start + state.pageSize, total);
        const pageRows = sorted.slice(start, end);

        info.textContent = `${total.toLocaleString("pt-BR")} registros`;
        pageLabel.textContent = `Pagina ${state.page} de ${totalPages}`;
        prev.disabled = state.page === 1;
        next.disabled = state.page === totalPages;
        prev.classList.toggle("opacity-40", prev.disabled);
        next.classList.toggle("opacity-40", next.disabled);

        if (!pageRows.length) {
            body.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-gray-400 py-6">
                        Nenhum registro encontrado para os filtros atuais.
                    </td>
                </tr>
            `;
            return;
        }

        body.innerHTML = pageRows.map((row) => `
            <tr>
                <td>${escapeHtml(row.ufv_label || row.ufv)}</td>
                <td>${escapeHtml(row.natureza)}</td>
                <td>${escapeHtml(row.fornecedor)}</td>
                <td class="text-right font-mono">${formatCurrency(row.contrato_original)}</td>
                <td class="text-right font-mono">${formatCurrency(row.valor_total)}</td>
                <td class="text-right font-mono">${formatCurrency(row.fd_medicao)}</td>
                <td class="text-right font-mono">${formatCurrency(row.saldo_a_medir)}</td>
                <td class="text-right font-semibold ${avancoDisplay(row.avanco_obra) >= 100 ? "text-green-300" : "text-amber-300"}">
                    ${formatPercent(avancoDisplay(row.avanco_obra))}
                </td>
                <td>${escapeHtml(row.ciclo)}</td>
            </tr>
        `).join("");
    }

    function updateResumo(filteredCapexRows) {
        const el = byId("resumoFiltros");
        if (!el) return;
        const label = state.selectedUfvKey === ALL_UFV_KEY
            ? "Portfolio"
            : `UFV: ${state.ufvLabelByKey[state.selectedUfvKey] || state.selectedUfvKey}`;
        el.textContent = `${label} | Registros: ${filteredCapexRows.length.toLocaleString("pt-BR")}`;
    }

    function render() {
        const { capexRows, finRows } = getFilteredData();
        const metrics = calculateMetrics(capexRows, finRows);

        renderKpis(metrics);
        renderComparativoChart(metrics);
        renderGauge(metrics);
        renderFluxoChart();
        renderTable(capexRows);
        renderSortIndicators();
        updateResumo(capexRows);
    }

    function bindEvents() {
        const filtroUfv = byId("filtroUfv");
        const filtroBusca = byId("filtroBusca");
        const pageSize = byId("pageSize");
        const btnLimpar = byId("btnLimpar");
        const prev = byId("prevPage");
        const next = byId("nextPage");

        filtroUfv.addEventListener("change", () => {
            state.selectedUfvKey = filtroUfv.value || ALL_UFV_KEY;
            state.page = 1;
            render();
        });

        filtroBusca.addEventListener("input", () => {
            state.searchText = safeText(filtroBusca.value).toLowerCase();
            state.page = 1;
            render();
        });

        pageSize.addEventListener("change", () => {
            state.pageSize = Number(pageSize.value) || 25;
            state.page = 1;
            render();
        });

        btnLimpar.addEventListener("click", () => {
            state.selectedUfvKey = ALL_UFV_KEY;
            state.searchText = "";
            state.page = 1;
            filtroUfv.value = ALL_UFV_KEY;
            filtroBusca.value = "";
            render();
        });

        prev.addEventListener("click", () => {
            state.page -= 1;
            render();
        });

        next.addEventListener("click", () => {
            state.page += 1;
            render();
        });

        document.querySelectorAll("th[data-sort]").forEach((th) => {
            th.addEventListener("click", () => {
                const key = th.getAttribute("data-sort");
                if (!key) return;
                if (state.sort.key === key) {
                    state.sort.dir = state.sort.dir === "asc" ? "desc" : "asc";
                } else {
                    state.sort.key = key;
                    state.sort.dir = key === "ufv" || key === "natureza" || key === "fornecedor" || key === "ciclo" ? "asc" : "desc";
                }
                state.page = 1;
                render();
            });
        });
    }

    async function initialize() {
        setStatus("Carregando dados...");
        const errors = [];

        try {
            const results = await Promise.allSettled([
                loadCsv(DATA_FILES.ciclo2),
                loadCsv(DATA_FILES.ciclo3),
                loadCsv(DATA_FILES.fluxo),
                loadCsv(DATA_FILES.geral)
            ]);

            const modifiedDates = [];

            function pickResult(index, fileName) {
                const result = results[index];
                if (result.status === "fulfilled") {
                    const payload = result.value;
                    if (payload.lastModified) modifiedDates.push(payload.lastModified);
                    if (payload.parseErrors.length) errors.push(...payload.parseErrors);
                    return payload.rows;
                }
                errors.push(`Erro ao carregar ${fileName}: ${result.reason && result.reason.message ? result.reason.message : result.reason}`);
                return [];
            }

            const ciclo2Rows = pickResult(0, DATA_FILES.ciclo2);
            const ciclo3Rows = pickResult(1, DATA_FILES.ciclo3);
            const fluxoRows = pickResult(2, DATA_FILES.fluxo);
            const geralRows = pickResult(3, DATA_FILES.geral);

            state.data.capex = [
                ...standardizeCapexRows(ciclo2Rows, "Ciclo 2"),
                ...standardizeCapexRows(ciclo3Rows, "Ciclo 3")
            ];
            state.data.financeiro = standardizeFinRows(geralRows);
            state.data.fluxo = normalizeFluxoRows(fluxoRows);
            state.ufvLabelByKey = buildUfvLabelMap(state.data.capex, state.data.financeiro);
            applyUfvLabels();
            state.errors = errors;

            updateTimestamp(modifiedDates);
            showAlerts(errors);

            if (!state.data.capex.length) {
                setStatus("Sem dados de Capex para exibir.", true);
            } else {
                setStatus("Dados carregados com sucesso.");
            }

            fillUfvFilter();
            bindEvents();
            render();
        } catch (err) {
            setStatus(`Falha geral na carga dos dados: ${err && err.message ? err.message : err}`, true);
            showAlerts([String(err)]);
        }
    }

    initialize();
})();
