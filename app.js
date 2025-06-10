const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// URL da sua API online
const BASE_URL = 'https://backend.haretable.com.br'; // substitua pela sua URL real


async function buscarPedidosParaImprimir() {
  const id_empresa = 1;

  try {
    const { data: pedidos } = await axios.get(`${BASE_URL}/pedidos-para-imprimir`, {
      params: { id_empresa }
    });

    console.log(pedidos, 'historicos');

    // Agrupar por mesa
    const agrupadoPorMesa = pedidos.reduce((acc, pedido) => {
      const idMesa = pedido.id_mesa;
      if (!acc[idMesa]) acc[idMesa] = [];
      acc[idMesa].push(pedido);
      return acc;
    }, {});

    for (const [mesa, itens] of Object.entries(agrupadoPorMesa)) {
      await imprimirPedidoPorMesa(mesa, itens);
    }

  } catch (err) {
    console.error('Erro ao buscar pedidos:', err.message);
  }
}


async function imprimirPedidoPorMesa(mesa, itens) {
  try {
    const dataAgora = new Date().toLocaleString();
    const dadosMesa = await buscarDadosMesa(mesa);

    const nome = dadosMesa.nome;
    const ordem_type = dadosMesa.ordem_type;
    const endereco = dadosMesa.endereco || 'Sem endereço';
    const telefone = dadosMesa.telefone || 'Sem telefone';
    // Obter a última observação do último item
    const ultimaObservacao = itens.length > 0 ? itens[itens.length - 1].observacao || '' : '';

const conteudo = `MESA: ${mesa} - ${ordem_type}
Nome: ${nome} 
endereco: ${endereco} 
telefone: ${telefone} 
DATA: ${dataAgora}
====================================
OBSERVAÇÃO: ${ultimaObservacao}
====================================
${itens.map(i =>
    `${i.nome_item} | quantidade: ${i.quantidade} `
).join('\n')}
====================================
`.trim();

    const filePath = path.resolve(__dirname, `mesa_${mesa}_${Date.now()}.txt`);
    fs.writeFileSync(filePath, conteudo, 'utf8');

    exec(`notepad /p "${filePath}"`, async (err) => {
      if (err) {
        console.error(`Erro ao imprimir mesa ${mesa}:`, err.message);
      } else {
        console.log(`✅ Mesa ${mesa} impressa com sucesso.`);

        // Marcar todos os pedidos da mesa como impressos
        for (const pedido of itens) {
          try {
            await axios.put(`${BASE_URL}/pedidos/${pedido.id_pedido}/impresso`, {
              impresso: true
            });
          } catch (apiErr) {
            console.error(`Erro ao atualizar status do pedido ${pedido.id_pedido}:`, apiErr.message);
          }
        }

        fs.unlinkSync(filePath); // Descomente para apagar o arquivo depois da impressão
      }
    });

  } catch (err) {
    console.error(`Erro ao imprimir pedidos da mesa ${mesa}:`, err.message);
  }
}


async function buscarDadosMesa(id_mesa) {
  try {
    const { data } = await axios.get(`${BASE_URL}/mesas/${id_mesa}`);
    return data;
  } catch (err) {
    console.error(`Erro ao buscar dados da mesa ${id_mesa}:`, err.message);
    return null;
  }
}


async function buscarHistoricoParaImprimir() {
  const id_empresa = 1; // Substitua por valor dinâmico se necessário

  try {
    const { data: historicos } = await axios.get(`${BASE_URL}/historico-para-imprimir`, {
      params: { id_empresa }
    });


    console.log(historicos,'historicos');


    for (const historico of historicos) {
      await imprimirHistoricoMesa(historico);
    }
  } catch (err) {
    console.error('Erro ao buscar históricos para imprimir:', err.message);
  }
}


async function imprimirHistoricoMesa(historico) {
  try {
    console.log('\n📦 DEBUG: Objeto histórico recebido:');
    console.dir(historico, { depth: null });

    const { id_historico, pedidos, nome_cliente, endereco_cliente, data_solicitacao } = historico;

    if (!Array.isArray(pedidos) || pedidos.length === 0) {
      console.error(`❌ Nenhum pedido encontrado para o histórico ${id_historico}.`);
      return;
    }

    let conteudo = `
CLIENTE: ${nome_cliente}
ENDEREÇO: ${endereco_cliente || '-'}
DATA: ${new Date(data_solicitacao).toLocaleString()}
========================================
ITEMS CONSUMIDOS
----------------------------------------
PRODUTO               | QTD | VALOR
\n
`.trim();
    let totalGeral = 0;

    for (const pedido of pedidos) {
      const { nome_item, quantidade, preco } = pedido;

      const precoUnit = parseFloat(preco);
      const qtd = parseInt(quantidade);
      const subtotal = precoUnit * qtd;
      totalGeral += subtotal;

      conteudo += `\n${nome_item.padEnd(22)} | ${qtd.toString().padEnd(3)} | R$ ${precoUnit.toFixed(2)}`;
    }
    
conteudo += `
\n----------------------------------------
TOTAL: R$ ${totalGeral.toFixed(2)}
========================================
`;

    const filePath = path.resolve(__dirname, `historico_${id_historico}.txt`);
    fs.writeFileSync(filePath, conteudo, 'utf8');

    exec(`notepad /p "${filePath}"`, async (err) => {
      if (err) {
        console.error(`Erro ao imprimir histórico ${id_historico}:`, err.message);
      } else {
        console.log(`✅ Histórico ${id_historico} impresso com sucesso.`);

        try {
          const response = await axios.delete(`${BASE_URL}/historico/${id_historico}`);
          console.log(`🗑️ Histórico ${id_historico} removido da fila com status ${response.status}`);
        } catch (apiErr) {
          console.error(`❌ Erro ao deletar histórico ${id_historico}:`);
          if (apiErr.response) {
            console.error('Status:', apiErr.response.status);
            console.error('Dados:', apiErr.response.data);
          } else {
            console.error(apiErr.message);
          }
        }

        fs.unlinkSync(filePath);
      }
    });

  } catch (err) {
    console.error(`Erro ao processar histórico ${historico?.id_historico || 'desconhecido'}:`, err.message);
  }
}


// Rodar a verificação a cada 10 segundos
setInterval(buscarPedidosParaImprimir, 10000);

setInterval(buscarHistoricoParaImprimir, 15000);
