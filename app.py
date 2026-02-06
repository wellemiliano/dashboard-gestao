import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import numpy as np

# Configuração da Página
st.set_page_config(page_title="Dashboard Capex & Obras", layout="wide")
st.title("🏗️ Dashboard de Controle Capex e Obras")
st.markdown("---")

# --- FUNÇÃO DE CARGA DE DADOS (LEITURA EXCEL) ---
@st.cache_data
def load_data():
    # Nomes dos arquivos (Devem estar na pasta do projeto)
    file_capex = '(COMERC GD) - Controle Capex_Ciclo 2 30_01_26_Ver03 (1).xlsx'
    file_geral = 'GERAL - PLANILHA PCs GDs (1) 1.xlsm'
    
    df_proj = pd.DataFrame()
    df_fluxo = pd.DataFrame()
    df_pagamentos = pd.DataFrame()
    
    # 1. Carregar CAPEX (Ciclos e Fluxo)
    try:
        # Ler abas específicas
        excel_capex = pd.ExcelFile(file_capex)
        
        # Tentar ler Ciclo 2 e 3 (Verificando nomes das abas)
        # Ajuste aqui se o nome da aba no Excel for diferente, ex: "Controle_Ciclo2"
        df_c2 = pd.read_excel(excel_capex, sheet_name='Controle Projetos_Ciclo2')
        df_c3 = pd.read_excel(excel_capex, sheet_name='Controle Projetos_Ciclo3')
        
        df_c2['Ciclo'] = 'Ciclo 2'
        df_c3['Ciclo'] = 'Ciclo 3'
        df_proj = pd.concat([df_c2, df_c3], ignore_index=True)
        
        # Limpeza Capex
        cols_num = ['Contrato original', 'Valor total', 'FD+Medição', 'Saldo a Medir', 'Avanço OBRA%']
        for col in cols_num:
            if col in df_proj.columns:
                df_proj[col] = pd.to_numeric(df_proj[col], errors='coerce').fillna(0)
        
        # Padronizar nomes
        if 'UFV' in df_proj.columns:
            df_proj['UFV'] = df_proj['UFV'].astype(str).str.strip().str.upper()

        # Ler Fluxo
        if 'Fluxo de caixa' in excel_capex.sheet_names:
            df_fluxo_raw = pd.read_excel(excel_capex, sheet_name='Fluxo de caixa')
            month_cols = [c for c in df_fluxo_raw.columns if 'Mês' in str(c)]
            if month_cols:
                df_fluxo = df_fluxo_raw.melt(id_vars=['Natureza'], value_vars=month_cols, 
                                            var_name='Mes', value_name='Valor')
                df_fluxo['Valor'] = pd.to_numeric(df_fluxo['Valor'], errors='coerce').fillna(0)
                
    except Exception as e:
        st.error(f"Erro ao ler arquivo CAPEX: {e}. Verifique se o nome do arquivo e das abas estão corretos.")

    # 2. Carregar GERAL (Pagamentos/NFs)
    try:
        # Tentar ler a primeira aba ou aba 'Planilha Geral' se existir
        df_pagamentos = pd.read_excel(file_geral) # Lê a primeira aba por padrão
        
        # Mapear colunas importantes
        # Colunas esperadas: 'USINA/FILIAL', 'VALOR DA NF', 'FORNECEDOR', 'STATUS DO LANÇAMENTO'
        col_map = {
            'USINA/FILIAL': 'UFV_Pag',
            'VALOR DA NF': 'Valor_Pago',
            'FORNECEDOR': 'Fornecedor_Pag',
            'STATUS DO LANÇAMENTO': 'Status_Pag'
        }
        df_pagamentos = df_pagamentos.rename(columns=col_map)
        
        # Limpar
        if 'Valor_Pago' in df_pagamentos.columns:
            df_pagamentos['Valor_Pago'] = pd.to_numeric(df_pagamentos['Valor_Pago'], errors='coerce').fillna(0)
        if 'UFV_Pag' in df_pagamentos.columns:
            df_pagamentos['UFV_Pag'] = df_pagamentos['UFV_Pag'].astype(str).str.strip().str.upper()
            
    except Exception as e:
        st.warning(f"Arquivo GERAL não encontrado ou com erro: {e}. O dashboard funcionará sem dados de pagamento.")

    return df_proj, df_fluxo, df_pagamentos

# Carregar Dados
df_proj, df_fluxo, df_pag = load_data()

if df_proj.empty:
    st.info("⚠️ Arquivos Excel não encontrados na pasta do repositório. Exibindo dados de exemplo para teste do app.")
    # Dados de exemplo mínimos para permitir deploy e testes sem os arquivos reais
    df_proj = pd.DataFrame({
        'Natureza': ['Obra', 'Equipamento', 'Serviço'],
        'Fornecedor': ['Fornecedor A', 'Fornecedor B', 'Fornecedor C'],
        'Contrato original': [1, 2, 3],
        'Valor total': [150000.0, 80000.0, 45000.0],
        'FD+Medição': [75000.0, 40000.0, 20000.0],
        'Saldo a Medir': [75000.0, 40000.0, 25000.0],
        'Avanço OBRA%': [50.0, 50.0, 44.4],
        'UFV': ['UFV1', 'UFV2', 'UFV1']
    })
    df_fluxo = pd.DataFrame()

# --- INTERFACE ---
st.sidebar.header("Filtros")
view_mode = st.sidebar.radio("Modo de Visão:", ["Visão Geral (Portfolio)", "Detalhe por UFV"])

# --- VISÃO 1: PORTFOLIO ---
if view_mode == "Visão Geral (Portfolio)":
    
    # KPIs Gerais (Capex)
    total_contratado = df_proj['Valor total'].sum()
    total_medido = df_proj['FD+Medição'].sum()
    
    # KPI Pagamentos (Arquivo Geral)
    total_pago_nf = df_pag['Valor_Pago'].sum() if not df_pag.empty else 0
    
    col1, col2, col3 = st.columns(3)
    col1.metric("💰 Total Contratado (Capex)", f"R$ {total_contratado:,.2f}")
    col2.metric("✅ Total Medido (Engenharia)", f"R$ {total_medido:,.2f}")
    col3.metric("🧾 Total NFs Processadas (Financ.)", f"R$ {total_pago_nf:,.2f}", 
               delta=f"Dif: R$ {total_pago_nf - total_medido:,.2f}", delta_color="off")
    
    st.markdown("---")
    
    # Gráficos
    c1, c2 = st.columns(2)
    with c1:
        st.subheader("Top 10 Maiores Gastos (Natureza)")
        df_nat = df_proj.groupby('Natureza')['Valor total'].sum().sort_values(ascending=False).head(10)
        fig = px.bar(df_nat, x=df_nat.values, y=df_nat.index, orientation='h', text_auto='.2s')
        st.plotly_chart(fig, use_container_width=True)
        
    with c2:
        st.subheader("Status dos Pagamentos (Geral)")
        if not df_pag.empty and 'Status_Pag' in df_pag.columns:
            df_status = df_pag.groupby('Status_Pag')['Valor_Pago'].sum().reset_index()
            fig2 = px.pie(df_status, values='Valor_Pago', names='Status_Pag', hole=0.4)
            st.plotly_chart(fig2, use_container_width=True)
        else:
            st.info("Sem dados de Status no arquivo Geral.")

# --- VISÃO 2: DETALHE POR UFV ---
else:
    # Lista unificada de UFVs (Capex + Pagamentos)
    ufvs_capex = df_proj['UFV'].unique().tolist() if 'UFV' in df_proj.columns else []
    ufvs_pag = df_pag['UFV_Pag'].unique().tolist() if not df_pag.empty and 'UFV_Pag' in df_pag.columns else []
    lista_ufvs = sorted(list(set(ufvs_capex + ufvs_pag)))
    
    selected_ufv = st.sidebar.selectbox("Selecione a UFV:", lista_ufvs)
    
    st.header(f"📍 Raio-X: {selected_ufv}")
    
    # Filtrar Capex
    df_proj_filt = df_proj[df_proj['UFV'] == selected_ufv]
    # Filtrar Pagamentos (Fuzzy match simples ou exato)
    df_pag_filt = pd.DataFrame()
    if not df_pag.empty:
        # Tenta match exato primeiro
        df_pag_filt = df_pag[df_pag['UFV_Pag'] == selected_ufv]
    
    # KPIs da Usina
    val_total = df_proj_filt['Valor total'].sum()
    val_medido = df_proj_filt['FD+Medição'].sum()
    val_pago = df_pag_filt['Valor_Pago'].sum() if not df_pag_filt.empty else 0
    avanco_fisico = df_proj_filt['Avanço OBRA%'].mean() if 'Avanço OBRA%' in df_proj_filt.columns else 0

    k1, k2, k3, k4 = st.columns(4)
    k1.metric("Contrato Total", f"R$ {val_total:,.2f}")
    k2.metric("Medido (Eng)", f"R$ {val_medido:,.2f}")
    k3.metric("Pago (NFs)", f"R$ {val_pago:,.2f}")
    k4.metric("Avanço Obra", f"{avanco_fisico:.1f}%")
    
    st.markdown("---")
    
    # Tabela de Contratos
    st.subheader("📋 Contratos e Aditivos (Capex)")
    cols_view = ['Natureza', 'Fornecedor', 'Contrato original', 'Valor total', 'Saldo a Medir', 'Avanço OBRA%']
    st.dataframe(df_proj_filt[cols_view].style.format({'Valor total': 'R$ {:,.2f}', 'Saldo a Medir': 'R$ {:,.2f}'}), use_container_width=True)
    
    # Tabela de Pagamentos
    st.subheader("💸 Últimas Notas Fiscais (Geral)")
    if not df_pag_filt.empty:
        cols_pag = ['FORNECEDOR', 'Nº DA NF ', 'DATA DE EMISSAO - NF ', 'Valor_Pago', 'Status_Pag']
        # Mapear de volta para nomes originais para exibição se quiser, ou usar os internos
        st.dataframe(df_pag_filt[['Fornecedor_Pag', 'Status_Pag', 'Valor_Pago']], use_container_width=True)
    else:
        st.info("Nenhum pagamento encontrado para esta UFV no arquivo Geral.")