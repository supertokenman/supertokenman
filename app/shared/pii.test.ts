import { describe, expect, it } from 'vitest'
import { findPii } from './pii'

describe('personal data', () => {
  it('finds valid CPF, CNPJ, e-mail, phone and card, and skips look-alikes', () => {
    const text = 'Cliente Ana, CPF 529.982.247-25, CNPJ 11.222.333/0001-81, e-mail ana@example.com.br, tel (11) 98765-4321, cartão 4111 1111 1111 1111. Pedido 123.456.789-00 e protocolo 1234567890123.'
    const kinds = findPii(text).map((p) => `${p.kind}:${p.text}`)
    expect(kinds).toEqual(['cnpj:11.222.333/0001-81', 'cpf:529.982.247-25', 'email:ana@example.com.br', 'card:4111 1111 1111 1111', 'phone:(11) 98765-4321'])
  })
  it('nothing in plain text', () => expect(findPii('Revenue grew 12% in Q3 to 1.234.567 units.')).toEqual([]))
})
