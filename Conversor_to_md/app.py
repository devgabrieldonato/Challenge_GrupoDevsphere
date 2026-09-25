"""Interface Streamlit. Execute: python -m streamlit run app.py."""
import streamlit as st

from converter import ConversionError, convert_document

st.set_page_config(page_title='Casos clínicos → Markdown', page_icon='📄', layout='centered')
st.title('Casos clínicos → Markdown')
st.write('Envie um PDF ou DOCX, confira o texto convertido e baixe o arquivo .md.')
st.caption('Protótipo acadêmico • Arquivos de até 10 MiB • PDF de até 100 páginas')
st.info('Use casos fictícios ou previamente identificados. O conversor não remove dados pessoais automaticamente.')


def clear_result() -> None:
    """Impede exibir um resultado antigo depois de trocar o arquivo."""
    st.session_state.pop('result', None)


upload = st.file_uploader(
    'Selecione o documento', type=['pdf', 'docx'], key='upload', on_change=clear_result,
    help='PDF precisa conter texto selecionável. Arquivos .doc não são aceitos.',
)
if st.button('Converter para Markdown', type='primary', disabled=upload is None):
    clear_result()
    try:
        with st.spinner('Convertendo documento…'):
            st.session_state.result = convert_document(upload.name, upload.getvalue())
    except ConversionError as exc:
        st.error(str(exc))

result = st.session_state.get('result')
if result is not None:
    st.success('Conversão concluída. Revise o conteúdo antes de utilizá-lo.')
    for warning in result.warnings:
        st.warning(warning)
    # Exibição como código: não interpreta HTML nem carrega links do documento.
    st.subheader('Conteúdo do arquivo Markdown')
    st.code(result.markdown, language='markdown')
    st.download_button(
        'Baixar arquivo .md', result.markdown.encode('utf-8'),
        file_name=result.filename, mime='text/markdown; charset=utf-8',
    )

if st.button('Limpar sessão'):
    st.session_state.clear()
    st.rerun()

st.caption('Processamento no servidor da aplicação, sem serviços externos de conversão. '
           'Este código não grava uploads em disco. O download é salvo pelo seu navegador.')
