import csv
import os
import re
import unicodedata
from datetime import datetime

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

DATA_FILES = {
    "ciclo2": "Ciclo2.csv",
    "ciclo3": "Ciclo3.csv",
    "fluxo": "Fluxo.csv",
    "geral": "Geral.csv",
}

CAPEX_COL_MAP = {
    "ufv": "ufv",
    "natureza": "natureza",
    "fornecedor": "fornecedor",
    "contratooriginal": "contrato_original",
    "valortotal": "valor_total",
    "fdmedido": "fd_medido",
    "medicao": "medicao",
    "fdmedicao": "fd_medicao",
    "saldoamedir": "saldo_a_medir",
    "avancocontratual": "avanco_contratual",
    "avancoobra": "avanco_obra",
    "portfolio": "portfolio",
    "portifolio": "portfolio",
}

FIN_COL_MAP = {
    "usinafilial": "ufv_pag",
    "usina": "ufv_pag",
    "filial": "ufv_pag",
    "valordanf": "valor_nf",
    "fornecedor": "fornecedor_pag",
    "statusdolancamento": "status_pag",
    "dataemissaonf": "data_emissao_nf",
    "nodanf": "numero_nf",
}


# -------------------------
# Helpers
# -------------------------

def normalize_col(name: str) -> str:
    text = str(name).strip()
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.lower()
    text = re.sub(r"[^a-z0-9]+", "", text)
    return text


def detect_header_row(path: str, marker: str = "UFV", max_rows: int = 25) -> int:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore", newline="") as f:
            reader = csv.reader(f)
            for i, row in enumerate(reader):
                if i >= max_rows:
                    break
                if any(cell.strip().upper() == marker.upper() for cell in row):
                    return i
    except Exception:
        pass
    return 0


def read_csv_guess_header(path: str, marker: str = "UFV") -> pd.DataFrame:
    header_row = detect_header_row(path, marker=marker)
    return pd.read_csv(path, header=header_row, engine="python")


def drop_junk_columns(df: pd.DataFrame) -> pd.DataFrame:
    drop_cols = []
    for col in df.columns:
        name = str(col).strip()
        if not name:
            drop_cols.append(col)
            continue
        if name.lower().startswith("unnamed"):
            drop_cols.append(col)
            continue
        if not re.search(r"[A-Za-z0-9]", name):
            drop_cols.append(col)
    return df.drop(columns=drop_cols, errors="ignore")


def to_number(series: pd.Series) -> pd.Series:
    s = series.astype(str).str.strip()
    has_comma = s.str.contains(",", na=False)
    s = s.where(~has_comma, s.str.replace(".", "", regex=False))
    s = s.str.replace(",", ".", regex=False)
    return pd.to_numeric(s, errors="coerce").fillna(0)


def standardize_capex(df: pd.DataFrame) -> pd.DataFrame:
    df = drop_junk_columns(df)
    rename = {}
    for col in df.columns:
        key = normalize_col(col)
        if key in CAPEX_COL_MAP:
            rename[col] = CAPEX_COL_MAP[key]
    df = df.rename(columns=rename)

    for col in [
        "contrato_original",
        "valor_total",
        "fd_medido",
        "medicao",
        "fd_medicao",
        "saldo_a_medir",
        "avanco_contratual",
        "avanco_obra",
    ]:
        if col in df.columns:
            df[col] = to_number(df[col])

    if "fd_medicao" not in df.columns:
        df["fd_medicao"] = df.get("fd_medido", 0) + df.get("medicao", 0)

    if "ufv" in df.columns:
        df["ufv"] = df["ufv"].astype(str).str.strip().str.upper()

    return df


def standardize_fin(df: pd.DataFrame) -> pd.DataFrame:
    rename = {}
    for col in df.columns:
        key = normalize_col(col)
        if key in FIN_COL_MAP:
            rename[col] = FIN_COL_MAP[key]
    df = df.rename(columns=rename)

    if "valor_nf" in df.columns:
        df["valor_nf"] = to_number(df["valor_nf"])
    if "ufv_pag" in df.columns:
        df["ufv_pag"] = df["ufv_pag"].astype(str).str.strip().str.upper()

    return df


def normalize_fluxo(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        return df

    month_cols = [c for c in df.columns if str(c).strip().lower().startswith(("mes", "mês"))]
    if not month_cols:
        return pd.DataFrame()

    base_cols = [c for c in df.columns if c not in month_cols]
    df_long = df.melt(id_vars=base_cols, value_vars=month_cols, var_name="mes", value_name="valor")
    df_long["valor"] = to_number(df_long["valor"])
    return df_long


def pct_from_series(series: pd.Series) -> float:
    if series.empty:
        return 0.0
    s = series.dropna()
    if s.empty:
        return 0.0
    max_v = s.max()
    avg = s.mean()
    return (avg * 100.0) if max_v <= 1.5 else avg


def last_update_label(paths: list[str]) -> str:
    mtimes = [os.path.getmtime(p) for p in paths if os.path.exists(p)]
    if not mtimes:
        return ""
    ts = datetime.fromtimestamp(max(mtimes)).strftime("%Y-%m-%d %H:%M")
    return f"Ultima atualizacao: {ts}"


# -------------------------
# App
# -------------------------

st.set_page_config(page_title="Painel de Gestao - Obras GD", layout="wide")

@st.cache_data
def load_data():
    errors = []

    # Capex
    df_c2 = pd.DataFrame()
    df_c3 = pd.DataFrame()

    if os.path.exists(DATA_FILES["ciclo2"]):
        try:
            df_c2 = read_csv_guess_header(DATA_FILES["ciclo2"])
            df_c2["ciclo"] = "Ciclo 2"
            df_c2 = standardize_capex(df_c2)
        except Exception as exc:
            errors.append(f"Erro ao ler Ciclo2.csv: {exc}")
    else:
        errors.append("Ciclo2.csv nao encontrado")

    if os.path.exists(DATA_FILES["ciclo3"]):
        try:
            df_c3 = read_csv_guess_header(DATA_FILES["ciclo3"])
            df_c3["ciclo"] = "Ciclo 3"
            df_c3 = standardize_capex(df_c3)
        except Exception as exc:
            errors.append(f"Erro ao ler Ciclo3.csv: {exc}")
    else:
        errors.append("Ciclo3.csv nao encontrado")

    df_capex = pd.concat([df_c2, df_c3], ignore_index=True) if not df_c2.empty or not df_c3.empty else pd.DataFrame()

    # Financeiro
    df_fin = pd.DataFrame()
    if os.path.exists(DATA_FILES["geral"]):
        try:
            df_fin = pd.read_csv(DATA_FILES["geral"], engine="python")
            df_fin = standardize_fin(df_fin)
        except Exception as exc:
            errors.append(f"Erro ao ler Geral.csv: {exc}")

    # Fluxo
    df_fluxo = pd.DataFrame()
    if os.path.exists(DATA_FILES["fluxo"]):
        try:
            df_fluxo_raw = pd.read_csv(DATA_FILES["fluxo"], engine="python")
            df_fluxo = normalize_fluxo(df_fluxo_raw)
        except Exception as exc:
            errors.append(f"Erro ao ler Fluxo.csv: {exc}")

    return df_capex, df_fin, df_fluxo, errors


st.title("Painel de Gestao - Obras GD")

update_label = last_update_label(list(DATA_FILES.values()))
if update_label:
    st.caption(update_label)

with st.spinner("Carregando dados..."):
    df_capex, df_fin, df_fluxo, errors = load_data()

if errors:
    st.warning("Alguns arquivos tiveram problemas de leitura. Verifique abaixo.")
    for err in errors:
        st.write(f"- {err}")

if df_capex.empty:
    st.info("Aguardando dados de Capex. Verifique Ciclo2.csv e Ciclo3.csv.")
    st.stop()

# Sidebar filters
st.sidebar.header("Filtros")
ufvs_capex = df_capex["ufv"].dropna().unique().tolist() if "ufv" in df_capex.columns else []
ufvs_fin = df_fin["ufv_pag"].dropna().unique().tolist() if (not df_fin.empty and "ufv_pag" in df_fin.columns) else []
lista_ufvs = sorted(set(ufvs_capex) | set(ufvs_fin))
lista_ufvs.insert(0, "Todas")

filtro_ufv = st.sidebar.selectbox("Selecione a UFV", lista_ufvs)

if filtro_ufv != "Todas":
    df_capex_filt = df_capex[df_capex["ufv"] == filtro_ufv]
    df_fin_filt = df_fin[df_fin["ufv_pag"] == filtro_ufv] if (not df_fin.empty and "ufv_pag" in df_fin.columns) else pd.DataFrame()
else:
    df_capex_filt = df_capex
    df_fin_filt = df_fin

# KPIs
valor_total = df_capex_filt["valor_total"].sum() if "valor_total" in df_capex_filt.columns else 0
valor_medido = df_capex_filt["fd_medicao"].sum() if "fd_medicao" in df_capex_filt.columns else 0
saldo_medir = df_capex_filt["saldo_a_medir"].sum() if "saldo_a_medir" in df_capex_filt.columns else 0
valor_pago = df_fin_filt["valor_nf"].sum() if (not df_fin_filt.empty and "valor_nf" in df_fin_filt.columns) else 0

k1, k2, k3, k4 = st.columns(4)
k1.metric("Total Contratado (Capex)", f"R$ {valor_total:,.2f}")
k2.metric("Total Medido (Engenharia)", f"R$ {valor_medido:,.2f}")
k3.metric("Total Pago (Financeiro)", f"R$ {valor_pago:,.2f}", delta=f"Dif: R$ {valor_pago - valor_medido:,.2f}")
k4.metric("Saldo a Medir", f"R$ {saldo_medir:,.2f}")

st.markdown("---")

# Charts
c1, c2 = st.columns([2, 1])

with c1:
    st.subheader("Contratado vs Medido vs Pago")
    chart_df = pd.DataFrame(
        {
            "Categoria": ["Contratado", "Medido", "Pago"],
            "Valor": [valor_total, valor_medido, valor_pago],
        }
    )
    fig_bar = px.bar(chart_df, x="Categoria", y="Valor", text_auto=".2s", color="Categoria")
    st.plotly_chart(fig_bar, use_container_width=True)

with c2:
    st.subheader("Avanco Fisico (medio)")
    avanco_val = pct_from_series(df_capex_filt["avanco_obra"]) if "avanco_obra" in df_capex_filt.columns else 0
    fig_gauge = go.Figure(
        go.Indicator(
            mode="gauge+number",
            value=avanco_val,
            title={"text": "% Avanco"},
            gauge={"axis": {"range": [None, 100]}, "bar": {"color": "#1f77b4"}},
        )
    )
    st.plotly_chart(fig_gauge, use_container_width=True)

st.markdown("---")

# Table
st.subheader("Detalhamento de Contratos")

table_cols = [
    "ufv",
    "natureza",
    "fornecedor",
    "contrato_original",
    "valor_total",
    "fd_medicao",
    "saldo_a_medir",
    "avanco_obra",
]

present_cols = [c for c in table_cols if c in df_capex_filt.columns]

df_table = df_capex_filt[present_cols].copy()

if "avanco_obra" in df_table.columns:
    df_table["avanco_obra"] = df_table["avanco_obra"].apply(lambda x: x * 100 if x <= 1.5 else x)

rename_display = {
    "ufv": "UFV",
    "natureza": "Natureza",
    "fornecedor": "Fornecedor",
    "contrato_original": "Contrato Original",
    "valor_total": "Valor Total",
    "fd_medicao": "FD + Medicao",
    "saldo_a_medir": "Saldo a Medir",
    "avanco_obra": "Avanco Obra %",
}

df_table = df_table.rename(columns=rename_display)

formatters = {
    "Contrato Original": "R$ {:,.2f}",
    "Valor Total": "R$ {:,.2f}",
    "FD + Medicao": "R$ {:,.2f}",
    "Saldo a Medir": "R$ {:,.2f}",
    "Avanco Obra %": "{:.1f}%",
}

st.dataframe(df_table.style.format(formatters), use_container_width=True, height=420)

# Fluxo de caixa (apenas consolidado)
if not df_fluxo.empty and filtro_ufv == "Todas":
    st.markdown("---")
    st.subheader("Previsao de Fluxo de Caixa")
    fluxo_sum = df_fluxo.groupby("mes")["valor"].sum().reset_index()
    fig_fluxo = px.line(fluxo_sum, x="mes", y="valor", markers=True)
    st.plotly_chart(fig_fluxo, use_container_width=True)
