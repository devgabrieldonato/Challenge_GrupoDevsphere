// Utilitários seguros: conteúdo de documentos, modelos e usuários nunca vira HTML executável.
export function node(tag, text = '', className = '') {
  const e = document.createElement(tag);
  e.textContent = text;
  if (className) e.className = className;
  return e;
}
export function asList(value) {
  return Array.isArray(value) ? value : value?.items || [];
}
export function message(element, text, error = false) {
  element.textContent = text;
  element.className = error ? 'status error' : 'status';
}
export function button(label, action) {
  const b = node('button', label, 'button');
  b.type = 'button';
  b.onclick = async () => {
    b.disabled = true;
    try {
      await action();
    } finally {
      b.disabled = false;
    }
  };
  return b;
}
export function field(parent, label, value) {
  const block = node('div');
  block.append(node('strong', label), node('p', String(value ?? 'Não informado')));
  parent.append(block);
}
