// Parceiros, economia e histórico estável.
//
// Modelo: o passeio tem um custo de REFERÊNCIA por pessoa. Cada PARCEIRO tem um
// preço POR PASSEIO (tabela parceiro_precos). Ao lançar, escolhe-se passeio +
// parceiro e o valor do parceiro pra aquele passeio é gravado (valor_servico).
// A economia (referência − real) é exclusiva do módulo financeiro.
//
// IMPORTANTE — histórico estável: o lançamento guarda um SNAPSHOT do custo de
// referência (custo_pax_ref), do nome do passeio (passeio_nome) e do nome do
// parceiro (parceiro_nome). Os cálculos usam esses valores congelados, com
// fallback para o join atual. Assim, editar um preço ou EXCLUIR um passeio/
// parceiro não altera os lançamentos passados. Se um lançamento tem parceiro é
// definido por valor_servico (snapshot), não por parceiro_id (que pode virar nulo).

// Rótulo do tipo de serviço.
export const tipoServicoLabel = (t) =>
  ({ van: 'Van', guia: 'Guia', van_guia: 'Van + Guia' }[t] || t || '—')

// Nome estável (snapshot com fallback para o join atual).
export const passeioNome = (l) => l?.passeios?.nome ?? l?.passeio_nome ?? '—'
export const parceiroNome = (l) => l?.parceiros?.nome ?? l?.parceiro_nome ?? null
// O passeio referenciado ainda existe?
export const passeioExcluido = (l) => !l?.passeios && l?.passeio_nome != null

// Custo de referência por pessoa — snapshot congelado, com fallback ao join.
const custoPaxRef = (l) => Number(l?.custo_pax_ref ?? l?.passeios?.custo_pax ?? 0)

// Custo de referência de um lançamento = pessoas × custo_pax (snapshot).
export const custoReferencia = (l) => (Number(l?.quantidade) || 0) * custoPaxRef(l)

// Tem parceiro? Decidido pelo snapshot do valor (independe do parceiro_id existir).
const temParceiro = (l) => l?.valor_servico != null && l?.valor_servico !== ''

// Custo real (caixa) = valor do serviço do parceiro, quando houver; senão a referência.
export const custoReal = (l) => (temParceiro(l) ? Number(l?.valor_servico || 0) : custoReferencia(l))

// Economia = referência − real (positiva quando o parceiro sai mais barato). 0 sem parceiro.
export const economiaLancamento = (l) =>
  temParceiro(l) ? custoReferencia(l) - Number(l?.valor_servico || 0) : 0
