import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

# --- CONFIGURAÇÃO DA PÁGINA ---
st.set_page_config(page_title="Painel de Gestão - Obras GD", layout="wide", page_icon="🏗️")

# --- FUNÇÃO DE CARGA DE DADOS ---
@st.cache_data
def load_data():
    try:
        # 1. Carregar Dados de Projetos (Ciclo 2 e 3)
        c2 = pd.read_csv('Ciclo2.csv')
        c3 = pd.read_csv('Ciclo3.csv')
        
        # Identificar origem
        c2['Origem_Ciclo'] = 'Ciclo 2'
        c3['Origem_Ciclo'] = 'Ciclo 3'
        
        # Juntar tudo
        df_capex = pd.concat([c2, c3], ignore_index=True)
        
        # Padronizar nomes de colunas importantes (remover espaços extras)
        df_capex.columns = df_capex.columns.str.strip()
        
        # Converter colunas numéricas (tratar erros de conversão)
        cols_num = ['Contrato original', 'Valor total', 'FD+Medição', 'Saldo a Medir', 'Avanço OBRA%', 'Avanço Contratual%']
        for col in cols_num:
            if col in df_capex.columns:
                df_capex[col] = pd.to_numeric(df_capex[col], errors='coerce').fillna(0)

        # Padronizar UFV para maiúsculo
        if 'UFV' in df_capex.columns:
            df_capex['UFV'] = df_capex['UFV'].astype(str).str.strip().str.upper()

        # 2. Carregar Dados Financeiros (Geral.csv)
        df_fin = pd.read_csv('Geral.csv')
        
        # Mapear colunas do Financeiro (Ajuste conforme o nome real no seu CSV)
        # Tenta encontrar colunas pelo nome provável
        col_valor_pag = [c for c in df_fin.columns if 'VALOR' in c.upper() and 'NF' in c.upper()]
        col_ufv_pag = [c for c in df_fin.columns if 'USINA' in c.upper() or 'FILIAL' in c.upper()]
        col_forn_pag = [c for c in df_fin.columns if 'FORNECEDOR' in c.upper()]
        
        if col_valor_pag: df_fin.rename(columns={col_valor_pag[0]: 'Valor_Pago'}, inplace=True)
        if col_ufv_pag: df_fin.rename(columns={col_ufv_pag[0]: 'UFV_Pag'}, inplace=True)
        if col_forn_pag: df_fin.rename(columns={col_forn_pag[0]: 'Fornecedor_Pag'}, inplace=True)

        # Limpeza Financeiro
        if 'Valor_Pago' in df_fin.columns:
            df_fin['Valor_Pago'] = pd.to_numeric(df_fin['Valor_Pago'], errors='coerce').fillna(0)
        if 'UFV_Pag' in df_fin.columns:
            df_fin['UFV_Pag'] = df_fin['UFV_Pag'].astype(str).str.strip().str.upper()

        # 3. Carregar Fluxo (Opcional)
        try:
            df_fluxo = pd.read_csv('Fluxo.csv')
        except:
            df_fluxo = pd.DataFrame()

        return df_capex, df_fin, df_fluxo

    except Exception as e:
        st.error(f"Erro ao carregar dados: {e}")
        return pd.DataFrame(), pd.DataFrame(), pd.DataFrame()

# Carregar
df_capex, df_fin, df_fluxo = load_data()

# Se não tiver dados, para por aqui
if df_capex.empty:
    st.warning("Aguardando sincronização dos dados...")
    st.stop()

# --- SIDEBAR (FILTROS) ---
st.sidebar.image("https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/Comerc_Energia_logo.png/800px-Comerc_Energia_logo.png", width=200)
st.sidebar.header("Filtros")

# Lista única de UFVs (Unindo Capex e Financeiro)
lista_ufvs = sorted(list(set(df_capex['UFV'].unique().tolist() + df_fin['UFV_Pag'].unique().tolist()))) if not df_fin.empty else sorted(df_capex['UFV'].unique().tolist())
lista_ufvs.insert(0, "Todas")

filtro_ufv = st.sidebar.selectbox("Selecione a UFV:", lista_ufvs)

# Filtrar Dataframes
if filtro_ufv != "Todas":
    df_capex_filt = df_capex[df_capex['UFV'] == filtro_ufv]
    df_fin_filt = df_fin[df_fin['UFV_Pag'] == filtro_ufv] if not df_fin.empty else pd.DataFrame()
    st.title(f"📊 Painel: {filtro_ufv}")
else:
    df_capex_filt = df_capex
    df_fin_filt = df_fin
    st.title("📊 Painel de Gestão Consolidado")

st.markdown("---")

# --- KPIS PRINCIPAIS ---
total_contratado = df_capex_filt['Valor total'].sum()
total_medido = df_capex_filt['FD+Medição'].sum()
saldo_a_medir = df_capex_filt['Saldo a Medir'].sum()
total_pago = df_fin_filt['Valor_Pago'].sum() if not df_fin_filt.empty else 0

col1, col2, col3, col4 = st.columns(4)
col1.metric("💰 Total Contratado (Capex)", f"R$ {total_contratado:,.2f}", help="Soma de todos os contratos + aditivos")
col2.metric("📏 Total Medido (Engenharia)", f"R$ {total_medido:,.2f}", help="O que já foi executado em campo")
col3.metric("💸 Total Pago (Financeiro)", f"R$ {total_pago:,.2f}", delta=f"Dif: R$ {total_pago - total_medido:,.2f}", help="Notas Fiscais processadas no sistema")
col4.metric("⏳ Saldo a Medir", f"R$ {saldo_a_medir:,.2f}", help="Exposição futura de caixa")

# --- GRÁFICOS ---
c1, c2 = st.columns([2, 1])

with c1:
    st.subheader("Evolução Financeira: Contratado vs Medido vs Pago")
    
    # Preparar dados para o gráfico
    dados_grafico = {
        'Categoria': ['Contratado', 'Medido', 'Pago'],
        'Valor': [total_contratado, total_medido, total_pago],
        'Cor': ['#1f77b4', '#ff7f0e', '#2ca02c']
    }
    fig_bar = px.bar(dados_grafico, x='Categoria', y='Valor', text_auto='.2s', color='Categoria', 
                     color_discrete_sequence=['#0083B8', '#F29F05', '#00C0F2'])
    st.plotly_chart(fig_bar, use_container_width=True)

with c2:
    st.subheader("Status de Obra (Médio)")
    if 'Avanço OBRA%' in df_capex_filt.columns:
        avanco_medio = df_capex_filt['Avanço OBRA%'].mean() * 100
    else:
        avanco_medio = 0
    
    fig_gauge = go.Figure(go.Indicator(
        mode = "gauge+number",
        value = avanco_medio,
        title = {'text': "% Avanço Físico"},
        gauge = {'axis': {'range': [None, 100]}, 'bar': {'color': "#0083B8"}}
    ))
    st.plotly_chart(fig_gauge, use_container_width=True)

# --- DETALHAMENTO ---
st.markdown("---")
st.subheader("📋 Detalhamento de Contratos")

# Seleção de colunas para tabela
cols_view = ['UFV', 'Natureza', 'Fornecedor', 'Valor total', 'FD+Medição', 'Saldo a Medir', 'Avanço OBRA%']
# Garantir que colunas existem
cols_final = [c for c in cols_view if c in df_capex_filt.columns]

st.dataframe(
    df_capex_filt[cols_final].sort_values(by='Valor total', ascending=False).style.format({
        'Valor total': 'R$ {:,.2f}',
        'FD+Medição': 'R$ {:,.2f}',
        'Saldo a Medir': 'R$ {:,.2f}',
        'Avanço OBRA%': '{:.1%}'
    }),
    use_container_width=True,
    height=400
)

# --- FLUXO DE CAIXA (Se existir) ---
if not df_fluxo.empty and filtro_ufv == "Todas":
    st.markdown("---")
    st.subheader("📉 Previsão de Fluxo de Caixa")
    # Agrupar por mês
    if 'Mes' in df_fluxo.columns and 'Valor' in df_fluxo.columns:
        fluxo_agrup = df_fluxo.groupby('Mes')['Valor'].sum().reset_index()
        fig_fluxo = px.line(fluxo_agrup, x='Mes', y='Valor', markers=True, title="Desembolso Previsto")
        st.plotly_chart(fig_fluxo, use_container_width=True)