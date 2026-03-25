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
    const ALL_CICLO_KEY = "__ALL_CICLO__";
    const UFV_KEY_ALIASES = {
        "ALFANAS 4": "ALFENAS 4",
        "BARRA DA CHOCA": "BARRA DO CHOCA",
        "CAMPOBELO 5": "CAMPO BELO 5",
        "PATO DE MINAS": "PATOS DE MINAS",
        "COMERC PERNANBUCO 3": "COMERC PERNAMBUCO 3",
        "CAMOCIM SAO FELIZ": "CAMOCIM DE SAO FELIX",
        "CAMOCIM SAO FELIZ AU03": "CAMOCIM DE SAO FELIX",
        "CAMOCIM SAO FELIZ AU04": "CAMOCIM DE SAO FELIX"
    };

    const state = {
        data: {
            capex: [],
            financeiro: [],
            fluxo: []
        },
        selectedUfvKey: ALL_UFV_KEY,
        selectedCiclo: ALL_CICLO_KEY,
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
        let text = safeText(value);
        if (!text) return "";

        text = text
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toUpperCase()
            .trim();

        // Remove prefixos com codigo tecnico no inicio: AZ05-, AH03-, etc.
        text = text.replace(/^[A-Z]{1,4}\d{1,3}\s*[-:]?\s*/, "");

        // Se houver conteudo entre parenteses, prioriza esse texto (ex.: "(CUPIRA)")
        const parenMatch = text.match(/\(([^()]{2,50})\)/);
        if (parenMatch && /[A-Z]/.test(parenMatch[1])) {
            text = parenMatch[1].trim();
        }

        let parts = null;
        if (text.includes(" - ")) {
            parts = text.split(" - ").map((p) => p.trim()).filter(Boolean);
        } else if (/\s-\s*/.test(text)) {
            // Trata casos como "UFV ... -JEQUIE" sem quebrar nomes tipo "GUARDA-MOR"
            parts = text.split(/\s-\s*/).map((p) => p.trim()).filter(Boolean);
        }

        if (parts && parts.length >= 2) {
            let tail = parts[parts.length - 1];
            // Se o ultimo trecho for so codigo, usa o trecho anterior.
            if (/^(?:[A-Z]{1,4}\d{1,6}|\d{2,6})$/.test(tail)) {
                tail = parts[parts.length - 2];
            }
            text = tail;
        }

        text = text
            .replace(/\bUFVS?\b/g, "UFV")
            .replace(/^UFV\s+/, "")
            .replace(/[^A-Z0-9]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        // Remove zero a esquerda em blocos numericos: "04" -> "4"
        text = text
            .split(" ")
            .map((token) => {
                if (/^\d+$/.test(token)) {
                    const parsed = parseInt(token, 10);
                    return Number.isFinite(parsed) ? String(parsed) : token;
                }
                return token;
            })
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

        if (Object.prototype.hasOwnProperty.call(UFV_KEY_ALIASES, text)) {
            return UFV_KEY_ALIASES[text];
        }
        return text;
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

    function ufvLabelQuality(label) {
        const upper = String(label || "").toUpperCase();
        let score = 0;
        if (/^[A-Z]{1,4}\d{1,3}\s*[-:]/.test(upper)) score += 100;
        if (/\b(CABECOTE|LTDA|SPE|HOLDING|GERACAO|ENERGIA|SOLAR|NEWCO|S\/A| SA\b| AS\b)\b/.test(upper)) score += 30;
        if (/\bUFV\b/.test(upper)) score += 5;
        if (/\d{3,}/.test(upper)) score += 8;
        score += Math.min(upper.length, 80) / 20;
        return score;
    }

    function isSelectableUfvKey(key) {
        const text = safeText(key).toUpperCase();
        if (!text) return false;
        if (text.length < 2) return false;
        if (text === "0" || text === "UFV" || text === "TOTAL" || text === "TODAS") return false;
        return /[A-Z]/.test(text);
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

    function formatCurrencyCompact(value) {
        const n = Number.isFinite(value) ? value : 0;
        return n.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
            notation: "compact",
            maximumFractionDigits: 1
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
            const canonicalFromKey = cleanUfvLabel(toTitleCasePt(key));
            if (canonicalFromKey) {
                const synthetic = variantsMap.get(canonicalFromKey) || {
                    label: canonicalFromKey,
                    total: 0,
                    capex: 0,
                    fin: 0
                };
                variantsMap.set(canonicalFromKey, synthetic);
            }

            const best = Array.from(variantsMap.values()).sort((a, b) => {
                const qa = ufvLabelQuality(a.label);
                const qb = ufvLabelQuality(b.label);
                if (qa !== qb) return qa - qb;
                if (b.capex !== a.capex) return b.capex - a.capex;
                if (b.total !== a.total) return b.total - a.total;
                if (a.label.length !== b.label.length) return a.label.length - b.label.length;
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

    function buildObjectsFromHeaderRows(matrixRows, headerIdx) {
        if (!Array.isArray(matrixRows) || headerIdx < 0 || headerIdx >= matrixRows.length) return [];

        const headerRow = matrixRows[headerIdx] || [];
        const headers = headerRow.map((cell, idx) => {
            const name = safeText(cell);
            return name || `col_${idx}`;
        });

        const out = [];
        for (let r = headerIdx + 1; r < matrixRows.length; r += 1) {
            const sourceRow = matrixRows[r] || [];
            const obj = {};
            let hasValue = false;

            for (let c = 0; c < headers.length; c += 1) {
                const key = headers[c];
                const value = c < sourceRow.length ? sourceRow[c] : "";
                obj[key] = value;
                if (!hasValue && safeText(value) !== "") hasValue = true;
            }

            if (hasValue) out.push(obj);
        }
        return out;
    }

    function parseCsvRows(text, headerMarker) {
        const marker = normalizeColName(headerMarker || "");

        if (marker) {
            const parsedRaw = Papa.parse(text, {
                header: false,
                skipEmptyLines: true
            });

            const matrixRows = Array.isArray(parsedRaw.data) ? parsedRaw.data : [];
            const headerIdx = matrixRows.findIndex((row) => {
                if (!Array.isArray(row)) return false;
                return row.some((cell) => normalizeColName(cell) === marker);
            });

            if (headerIdx >= 0) {
                return {
                    rows: buildObjectsFromHeaderRows(matrixRows, headerIdx),
                    parseErrors: parsedRaw.errors || []
                };
            }
        }

        const parsedHeader = Papa.parse(text, {
            header: true,
            skipEmptyLines: true
        });
        return {
            rows: parsedHeader.data || [],
            parseErrors: parsedHeader.errors || []
        };
    }

    async function loadCsv(path, headerMarker) {
        const response = await fetch(`${path}?v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) {
            throw new Error(`Falha ao carregar ${path} (HTTP ${response.status})`);
        }
        const text = await response.text();
        const parsed = parseCsvRows(text, headerMarker);

        const parseErrors = (parsed.parseErrors || [])
            .filter((e) => e && e.code !== "UndetectableDelimiter")
            .map((e) => `${path}: ${e.message}`);

        return {
            rows: parsed.rows || [],
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

        const capexKeySet = new Set();
        for (const row of state.data.capex) {
            if (isSelectableUfvKey(row.ufv_key)) capexKeySet.add(row.ufv_key);
        }

        const finKeySet = new Set();
        for (const row of state.data.financeiro) {
            if (isSelectableUfvKey(row.ufv_key)) finKeySet.add(row.ufv_key);
        }

        // Base do filtro: UFVs do Capex (dados mais consistentes).
        // Se nao houver Capex carregado, cai para as UFVs limpas do financeiro.
        const ufvSet = new Set();
        if (capexKeySet.size > 0) {
            for (const key of capexKeySet) ufvSet.add(key);
        } else {
            for (const key of finKeySet) {
                const label = state.ufvLabelByKey[key] || key;
                if (ufvLabelQuality(label) <= 18) {
                    ufvSet.add(key);
                }
            }
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

    function fillCicloFilter() {
        const select = byId("filtroCiclo");
        if (!select) return;

        const ciclos = Array.from(new Set(
            state.data.capex
                .map((row) => safeText(row.ciclo))
                .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));

        const options = [{ key: ALL_CICLO_KEY, label: "Todos" }, ...ciclos.map((ciclo) => ({
            key: ciclo,
            label: ciclo
        }))];

        select.innerHTML = options
            .map((opt) => `<option value="${escapeHtml(opt.key)}">${escapeHtml(opt.label)}</option>`)
            .join("");

        const hasCurrent = options.some((opt) => opt.key === state.selectedCiclo);
        state.selectedCiclo = hasCurrent ? state.selectedCiclo : ALL_CICLO_KEY;
        select.value = state.selectedCiclo;
    }

    function getFilteredData() {
        const ufvKey = state.selectedUfvKey;
        const ciclo = state.selectedCiclo;
        const q = state.searchText;
        const allUfvSelected = ufvKey === ALL_UFV_KEY;
        const allCicloSelected = ciclo === ALL_CICLO_KEY;

        const capexRows = state.data.capex.filter((row) => {
            const ufvMatch = allUfvSelected || row.ufv_key === ufvKey;
            const cicloMatch = allCicloSelected || row.ciclo === ciclo;
            if (!ufvMatch || !cicloMatch) return false;

            if (!q) return true;
            const hay = `${row.ufv_label || row.ufv} ${row.natureza} ${row.fornecedor} ${row.ciclo}`.toLowerCase();
            return hay.includes(q);
        });

        const capexUfvKeys = new Set(capexRows.map((row) => row.ufv_key).filter(Boolean));

        const finRows = state.data.financeiro.filter((row) => {
            const ufvMatch = allUfvSelected || row.ufv_key === ufvKey;
            if (!ufvMatch) return false;

            if (!allCicloSelected) {
                return capexUfvKeys.has(row.ufv_key);
            }
            return true;
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
        const avancoContratualSeries = capexRows
            .map((row) => row.avanco_contratual)
            .filter((v) => Number.isFinite(v) && v > 0);

        const avanco = avancoContratualSeries.length ? pctFromSeries(avancoContratualSeries) : 0;

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
        const values = [metrics.totalContratado, metrics.totalMedido];
        const labels = ["Contratado", "Medido"];
        const maxValue = Math.max(...values, 1);
        const textPositions = values.map((v) => (v <= maxValue * 0.12 ? "outside" : "auto"));

        const data = [{
            type: "bar",
            x: labels,
            y: values,
            marker: {
                color: ["#64748b", "#3b82f6"],
                line: { color: "#111", width: 1 }
            },
            text: values.map(formatCurrencyCompact),
            customdata: values.map(formatCurrency),
            textposition: textPositions,
            cliponaxis: false,
            hovertemplate: "%{x}<br>%{customdata}<extra></extra>"
        }];

        const layout = plotCommonLayout();
        layout.margin = { t: 80, r: 28, b: 52, l: 70 };
        layout.yaxis.tickprefix = "R$ ";
        layout.yaxis.range = [0, maxValue * 1.22];
        layout.uniformtext = { minsize: 11, mode: "hide" };

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
            title: {
                text: "% Avanco Contratual"
            },
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
        const chartMensal = byId("chartFluxo");
        const chartAcumulado = byId("chartFluxoAcumulado");
        if (!section || !chartMensal || !chartAcumulado) return;

        if (!state.data.fluxo.length) {
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
        const acumulado = [];
        let running = 0;
        for (const value of y) {
            running += value;
            acumulado.push(running);
        }

        const dataMensal = [{
            type: "bar",
            x: x,
            y: y,
            marker: {
                color: "#60AB56",
                line: { color: "#3f7e3f", width: 1 }
            },
            customdata: y.map(formatCurrency),
            hovertemplate: "%{x}<br>Fluxo mensal: %{customdata}<extra></extra>"
        }];

        const layoutMensal = plotCommonLayout();
        layoutMensal.margin = { t: 20, r: 18, b: 50, l: 60 };
        layoutMensal.yaxis.tickprefix = "R$ ";

        Plotly.newPlot("chartFluxo", dataMensal, layoutMensal, {
            displayModeBar: false,
            responsive: true
        });

        const dataAcumulado = [{
            type: "scatter",
            mode: "lines+markers",
            x: x,
            y: acumulado,
            line: { color: "#AECC56", width: 3 },
            marker: { size: 6, color: "#AECC56" },
            fill: "tozeroy",
            fillcolor: "rgba(174, 204, 86, 0.12)",
            customdata: acumulado.map(formatCurrency),
            hovertemplate: "%{x}<br>Fluxo acumulado: %{customdata}<extra></extra>"
        }];

        const layoutAcumulado = plotCommonLayout();
        layoutAcumulado.margin = { t: 20, r: 18, b: 50, l: 60 };
        layoutAcumulado.yaxis.tickprefix = "R$ ";

        Plotly.newPlot("chartFluxoAcumulado", dataAcumulado, layoutAcumulado, {
            displayModeBar: false,
            responsive: true
        });
        section.classList.remove("hidden");
    }

    function applyFieldTooltips() {
        const tipsById = {
            statusCarregamento: "Status da leitura dos arquivos de dados do dashboard.",
            ultimaAtualizacao: "Data e hora da ultima atualizacao detectada nos arquivos fonte.",
            resumoFiltros: "Resumo dos filtros ativos e quantidade de registros exibidos na tabela.",
            btnLimpar: "Limpa UFV, Ciclo e Busca, retornando para a visao geral.",
            filtroUfv: "Filtra o dashboard por usina (UFV).",
            filtroBusca: "Busca textual por UFV, natureza, fornecedor ou ciclo.",
            filtroCiclo: "Filtra os dados por ciclo de obra.",
            kpiContratado: "Soma dos valores contratados nas linhas de Capex filtradas.",
            kpiMedido: "Soma do valor medido (FD + Medicao) nas linhas filtradas.",
            kpiPago: "Soma dos pagamentos do financeiro vinculados ao recorte atual.",
            kpiSaldo: "Saldo ainda a medir considerando os contratos filtrados.",
            kpiDif: "Diferenca entre valor pago e valor medido.",
            chartComparativo: "Compara os totais de contratado e medido no recorte atual.",
            chartGauge: "Percentual medio de avanco contratual no recorte atual.",
            chartFluxo: "Fluxo de caixa mensal previsto para o portfolio completo.",
            chartFluxoAcumulado: "Evolucao acumulada do fluxo de caixa ao longo dos meses.",
            tableInfo: "Quantidade total de contratos exibidos na tabela.",
            prevPage: "Volta para a pagina anterior da tabela.",
            nextPage: "Avanca para a proxima pagina da tabela.",
            pageLabel: "Pagina atual da tabela."
        };

        for (const [id, text] of Object.entries(tipsById)) {
            const el = byId(id);
            if (el) el.title = text;
        }

        const sortTips = {
            ufv: "Usina associada ao contrato.",
            natureza: "Natureza do servico, material ou escopo contratado.",
            fornecedor: "Fornecedor responsavel pelo contrato.",
            contrato_original: "Valor original do contrato antes de aditivos.",
            valor_total: "Valor total considerando aditivos e ajustes.",
            fd_medicao: "Valor total medido (FD + Medicao).",
            saldo_a_medir: "Valor ainda nao medido no contrato.",
            avanco_contratual: "Percentual de avanco contratual da linha.",
            ciclo: "Ciclo de planejamento/execucao do contrato."
        };

        document.querySelectorAll("th[data-sort]").forEach((th) => {
            const key = th.getAttribute("data-sort");
            if (!key) return;
            th.title = sortTips[key] || "Clique para ordenar a tabela por esta coluna.";
        });
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
                        Nenhum contrato com valor original encontrado para os filtros atuais.
                    </td>
                </tr>
            `;
            return;
        }

        body.innerHTML = pageRows.map((row) => `
            <tr>
                <td title="UFV do contrato">${escapeHtml(row.ufv_label || row.ufv)}</td>
                <td title="Natureza do contrato">${escapeHtml(row.natureza)}</td>
                <td title="Fornecedor do contrato">${escapeHtml(row.fornecedor)}</td>
                <td title="Valor original do contrato" class="text-right font-mono">${formatCurrency(row.contrato_original)}</td>
                <td title="Valor total com aditivos" class="text-right font-mono">${formatCurrency(row.valor_total)}</td>
                <td title="Valor medido (FD + Medicao)" class="text-right font-mono">${formatCurrency(row.fd_medicao)}</td>
                <td title="Saldo ainda a medir" class="text-right font-mono">${formatCurrency(row.saldo_a_medir)}</td>
                <td title="Percentual de avanco contratual" class="text-right font-semibold ${avancoDisplay(row.avanco_contratual) >= 100 ? "text-green-300" : "text-amber-300"}">
                    ${formatPercent(avancoDisplay(row.avanco_contratual))}
                </td>
                <td title="Ciclo do contrato">${escapeHtml(row.ciclo)}</td>
            </tr>
        `).join("");
    }

    function updateResumo(filteredCapexRows) {
        const el = byId("resumoFiltros");
        if (!el) return;
        const ufvLabel = state.selectedUfvKey === ALL_UFV_KEY
            ? "Portfolio"
            : `UFV: ${state.ufvLabelByKey[state.selectedUfvKey] || state.selectedUfvKey}`;
        const cicloLabel = state.selectedCiclo === ALL_CICLO_KEY
            ? "Todos os ciclos"
            : state.selectedCiclo;
        el.textContent = `${ufvLabel} | Ciclo: ${cicloLabel} | Registros: ${filteredCapexRows.length.toLocaleString("pt-BR")}`;
    }

    function render() {
        const { capexRows, finRows } = getFilteredData();
        const tableRows = capexRows.filter((row) => Number.isFinite(row.contrato_original) && Math.abs(row.contrato_original) > 0);
        const metrics = calculateMetrics(capexRows, finRows);

        renderKpis(metrics);
        renderComparativoChart(metrics);
        renderGauge(metrics);
        renderFluxoChart();
        renderTable(tableRows);
        renderSortIndicators();
        updateResumo(tableRows);
    }

    function bindEvents() {
        const filtroUfv = byId("filtroUfv");
        const filtroCiclo = byId("filtroCiclo");
        const filtroBusca = byId("filtroBusca");
        const btnLimpar = byId("btnLimpar");
        const prev = byId("prevPage");
        const next = byId("nextPage");

        filtroUfv.addEventListener("change", () => {
            state.selectedUfvKey = filtroUfv.value || ALL_UFV_KEY;
            state.page = 1;
            render();
        });

        filtroCiclo.addEventListener("change", () => {
            state.selectedCiclo = filtroCiclo.value || ALL_CICLO_KEY;
            state.page = 1;
            render();
        });

        filtroBusca.addEventListener("input", () => {
            state.searchText = safeText(filtroBusca.value).toLowerCase();
            state.page = 1;
            render();
        });

        btnLimpar.addEventListener("click", () => {
            state.selectedUfvKey = ALL_UFV_KEY;
            state.selectedCiclo = ALL_CICLO_KEY;
            state.searchText = "";
            state.page = 1;
            filtroUfv.value = ALL_UFV_KEY;
            filtroCiclo.value = ALL_CICLO_KEY;
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
                loadCsv(DATA_FILES.ciclo2, "UFV"),
                loadCsv(DATA_FILES.ciclo3, "UFV"),
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
            fillCicloFilter();
            bindEvents();
            applyFieldTooltips();
            render();
        } catch (err) {
            setStatus(`Falha geral na carga dos dados: ${err && err.message ? err.message : err}`, true);
            showAlerts([String(err)]);
        }
    }

    initialize();
})();
