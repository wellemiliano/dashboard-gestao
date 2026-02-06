import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go

# Configuração da Página
st.set_page_config(page_title="Dashboard Capex & Obras", layout="wide")

# Título Principal
st.title("🏗️ Dashboard de Controle Capex e Obras")
st.markdown("---")

# --- FUNÇÃO DE CARGA DE DADOS ---
@st.cache_data
def load_data():
    # Nomes EXATOS dos arquivos CSV que devem estar na mesma pasta deste script
    file_ciclo2 = '(COMERC GD) - Controle Capex_Ciclo 2 30_01_26_Ver03 (1).xlsx - Controle Projetos_Ciclo2.csv'
    file_ciclo3 = '(COMERC GD) - Controle Capex_Ciclo 2 30_01_26_Ver03 (1).xlsx - Controle Projetos_Ciclo3.csv'
    file_fluxo = '(COMERC GD) - Controle Capex_Ciclo 2 30_01_26_Ver03 (1).xlsx - Fluxo de caixa.csv'
    
    try:
        # Carregar CSVs
        df_c2 = pd.read_csv(file_ciclo2)
        df_c3 = pd.read_csv(file_ciclo3)
        df_fluxo_raw = pd.read_csv(file_fluxo)
        
        # Consolidação Projetos
        df_c2['Ciclo'] = 'Ciclo 2'
        df_c3['Ciclo'] = 'Ciclo 3'
        
        # Concatenar
        df_projects = pd.concat([df_c2, df_c3], ignore_index=True)
        
        # Limpeza Numérica
        cols_num = ['Contrato original', 'Valor total', 'FD+Medição', 'Saldo a Medir', 
                   'Aditivo 1', 'Avanço Contratual%', 'Avanço OBRA%']
        
        for col in cols_num:
            if col in df_projects.columns:
                df_projects[col] = pd.to_numeric(df_projects[col], errors='coerce').fillna(0)
                
        # Limpeza Strings
        if 'UFV' in df_projects.columns:
            df_projects['UFV'] = df_projects['UFV'].astype(str).str.strip()
        if 'Fornecedor' in df_projects.columns:
            df_projects['Fornecedor'] = df_projects['Fornecedor'].astype(str).str.strip()
        
        # Tratamento Fluxo
        month_cols = [c for c in df_fluxo_raw.columns if 'Mês' in c]
        if month_cols:
            df_fluxo = df_fluxo_raw.melt(id_vars=['Natureza'], value_vars=month_cols, 
                                        var_name='Mes', value_name='Valor')
            df_fluxo['Valor'] = pd.to_numeric(df_fluxo['Valor'], errors='coerce').fillna(0)
        else:
            df_fluxo = pd.DataFrame() 
            
        return df_projects, df_fluxo

    except Exception as e:
        st.error(f"Erro ao carregar arquivos: {e}")
        return pd.DataFrame(), pd.DataFrame()

# Carregar Dados
df_proj, df_fluxo = load_data()

if df_proj.empty:
    st.info("Aguardando arquivos CSV na pasta... Verifique se os nomes estão corretos.")
    st.stop()

# --- SIDEBAR (FILTROS) ---
st.sidebar.header("Filtros")
view_mode = st.sidebar.radio("Modo de Visão:", ["Visão Geral (Portfolio)", "Detalhe por UFV"])

# --- MODO 1: VISÃO GERAL ---
if view_mode == "Visão Geral (Portfolio)":
    
    total_contratado = df_proj['Valor total'].sum()
    total_medido = df_proj['FD+Medição'].sum()
    saldo_medir = df_proj['Saldo a Medir'].sum()
    
    col1, col2, col3 = st.columns(3)
    col1.metric("💰 Total Contratado", f"R$ {total_contratado:,.2f}")
    col2.metric("✅ Total Medido", f"R$ {total_medido:,.2f}")
    col3.metric("⏳ Saldo a Medir", f"R$ {saldo_medir:,.2f}")
    
    st.markdown("---")
    
    c1, c2 = st.columns(2)
    
    with c1:
        st.subheader("Maiores Gastos por Natureza")
        df_nat = df_proj.groupby('Natureza')['Valor total'].sum().sort_values(ascending=False).head(10)
        fig_nat = px.bar(df_nat, x=df_nat.values, y=df_nat.index, orientation='h', text_auto='.2s')
        st.plotly_chart(fig_nat, use_container_width=True)
        
    with c2:
        st.subheader("Fluxo de Caixa Previsto")
        if not df_fluxo.empty:
            df_fluxo_agrup = df_fluxo.groupby('Mes')['Valor'].sum().reset_index()
            # Ordenação simples por texto (Melhorar se necessário)
            fig_fluxo = px.line(df_fluxo_agrup, x='Mes', y='Valor', markers=True)
            st.plotly_chart(fig_fluxo, use_container_width=True)

# --- MODO 2: DETALHE POR UFV ---
else:
    if 'UFV' in df_proj.columns:
        lista_ufvs = sorted(df_proj['UFV'].unique().tolist())
        selected_ufv = st.sidebar.selectbox("Selecione a UFV:", lista_ufvs)
        
        df_filtered = df_proj[df_proj['UFV'] == selected_ufv]
        
        st.header(f"📍 {selected_ufv}")
        
        val_total = df_filtered['Valor total'].sum()
        val_medido = df_filtered['FD+Medição'].sum()
        avanco_fisico = df_filtered['Avanço OBRA%'].mean() if 'Avanço OBRA%' in df_filtered.columns else 0
        
        k1, k2, k3 = st.columns(3)
        k1.metric("Contrato Total", f"R$ {val_total:,.2f}")
        k2.metric("Medido", f"R$ {val_medido:,.2f}")
        k3.metric("Avanço Físico Médio", f"{avanco_fisico:.1f}%")
        
        st.markdown("### Contratos Detalhados")
        cols_display = ['Natureza', 'Fornecedor', 'Valor total', 'FD+Medição', 'Saldo a Medir', 'Avanço OBRA%']
        cols_final = [c for c in cols_display if c in df_filtered.columns]
        st.dataframe(df_filtered[cols_final], use_container_width=True)
    else:
        st.warning("Coluna UFV não encontrada.")