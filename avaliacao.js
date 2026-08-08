/* =====================================================================
   avaliacao.js — nota de 0 a 10 nos dois modos
   ---------------------------------------------------------------------
   Modo tela : você bate no retângulo grande, o app anota a hora exata.
   Modo pad  : o microfone escuta o pad de verdade e detecta as batidas
               pelo transiente (o "estalo" do golpe). Nada é gravado,
               nada é enviado — o áudio só passa pelo detector e some.
   Em ambos, a régua é a lista de horas-alvo que o motor agendou.
   ===================================================================== */

const Avaliacao = (function () {

  /* ================== CÁLCULO DA NOTA ================== */
  function calcular(toques, alvos, intervaloS) {
    const vazio = {
      valida: false, nota: 0, acertos: 0, esperadas: 0, perdidas: 0, extras: 0,
      adiantadas: 0, atrasadas: 0, noTempo: 0, mediaMs: 0, desvioMedioMs: 0, janelaMs: 0
    };
    if (!toques.length || !alvos.length) return vazio;

    const janelaS = Math.min(0.15, intervaloS * 0.45);
    const primeiro = toques[0], ultimo = toques[toques.length - 1];

    // só contam os alvos do trecho em que o aluno realmente tocou
    const naJanela = alvos.filter(function (a) {
      return a >= primeiro - janelaS && a <= ultimo + janelaS;
    });
    if (naJanela.length < 4 || toques.length < 4) return vazio;

    const usados = {};
    const desvios = [];
    let extras = 0;

    toques.forEach(function (t) {
      let melhor = -1, melhorD = Infinity;
      for (let i = 0; i < naJanela.length; i++) {
        if (usados[i]) continue;
        const d = Math.abs(t - naJanela[i]);
        if (d < melhorD) { melhorD = d; melhor = i; }
      }
      if (melhor >= 0 && melhorD <= janelaS) {
        usados[melhor] = true;
        desvios.push((t - naJanela[melhor]) * 1000);   // ms, negativo = adiantado
      } else {
        extras++;
      }
    });

    const acertos = desvios.length;
    if (!acertos) return vazio;

    const esperadas = naJanela.length;
    const perdidas = Math.max(0, esperadas - acertos);
    const somaAbs = desvios.reduce(function (s, d) { return s + Math.abs(d); }, 0);
    const soma = desvios.reduce(function (s, d) { return s + d; }, 0);
    const desvioMedio = somaAbs / acertos;          // o que vale para a nota
    const media = soma / acertos;                   // tendência (adianta ou atrasa)

    const adiantadas = desvios.filter(function (d) { return d < -8; }).length;
    const atrasadas  = desvios.filter(function (d) { return d > 8; }).length;
    const noTempo    = acertos - adiantadas - atrasadas;

    const janelaMs = janelaS * 1000;
    const precisao = Math.max(0, 1 - desvioMedio / janelaMs);
    const completude = esperadas ? acertos / esperadas : 0;
    const limpeza = (acertos + extras) ? acertos / (acertos + extras) : 0;

    let nota = 10 * precisao * Math.pow(completude, 0.5) * Math.pow(limpeza, 0.3);
    nota = Math.max(0, Math.min(10, Math.round(nota * 10) / 10));

    return {
      valida: true, nota: nota,
      acertos: acertos, esperadas: esperadas, perdidas: perdidas, extras: extras,
      adiantadas: adiantadas, atrasadas: atrasadas, noTempo: noTempo,
      mediaMs: Math.round(media * 10) / 10,
      desvioMedioMs: Math.round(desvioMedio * 10) / 10,
      janelaMs: Math.round(janelaMs)
    };
  }

  /* Frase curta de diagnóstico, além do comentário do mestre */
  function diagnostico(r) {
    if (!r.valida) return 'Faltou material: toque pelo menos uns 8 golpes seguidos.';
    const partes = [];
    if (r.mediaMs < -12) partes.push('você tende a adiantar (' + Math.abs(r.mediaMs) + ' ms na frente)');
    else if (r.mediaMs > 12) partes.push('você tende a atrasar (' + r.mediaMs + ' ms atrás)');
    else partes.push('sua tendência está centrada — nem adianta nem atrasa');
    if (r.perdidas > 0) partes.push(r.perdidas + ' nota(s) não saíram');
    if (r.extras > 0) partes.push(r.extras + ' batida(s) fora do lugar');
    return partes.join('; ') + '.';
  }

  /* ================== AVALIAÇÃO PELO PAD (MICROFONE) ================== */
  const microfone = (function () {
    let fluxo = null, fonte = null, processador = null, filtro = null, mudo = null;
    let ligado = false;
    let onsets = [];
    let amostrasProcessadas = 0;
    let tempoInicio = 0;
    let fundo = 0.002;          // estimativa do ruído da sala
    let ultimoOnset = -1;
    let aoDetectar = null;

    const REFRATARIO = 0.045;   // 45 ms: evita contar o mesmo golpe duas vezes
    const FATOR = 3.2;          // quantas vezes acima do fundo conta como golpe
    const PISO = 0.012;

    function suportado() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    function origemSegura() {
      return window.isSecureContext === true ||
             location.protocol === 'https:' ||
             location.hostname === 'localhost' ||
             location.hostname === '127.0.0.1';
    }

    async function ligar(callback) {
      if (ligado) return true;
      if (!suportado()) throw new Error('Este navegador não oferece acesso ao microfone.');
      if (!origemSegura()) {
        throw new Error('O navegador só libera o microfone em endereço seguro (https) ou em localhost. ' +
                        'No celular isso vai funcionar na Fase 4, quando o app estiver publicado.');
      }
      const ctx = Motor.contexto();
      fluxo = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });

      fonte = ctx.createMediaStreamSource(fluxo);

      filtro = ctx.createBiquadFilter();
      filtro.type = 'highpass';
      filtro.frequency.value = 220;      // corta ronco de sala e passos

      processador = ctx.createScriptProcessor(256, 1, 1);
      mudo = ctx.createGain();
      mudo.gain.value = 0;               // o microfone nunca volta pelo alto-falante

      amostrasProcessadas = 0;
      tempoInicio = ctx.currentTime;
      fundo = 0.002;
      ultimoOnset = -1;
      onsets = [];
      aoDetectar = callback || null;

      processador.onaudioprocess = function (ev) {
        const buf = ev.inputBuffer.getChannelData(0);
        const sr = ctx.sampleRate;
        let pico = 0, iPico = 0;
        for (let i = 0; i < buf.length; i++) {
          const x = Math.abs(buf[i]);
          if (x > pico) { pico = x; iPico = i; }
        }
        const limiar = Math.max(PISO, fundo * FATOR);
        const tBloco = tempoInicio + amostrasProcessadas / sr;

        if (pico > limiar && (tBloco - ultimoOnset) > REFRATARIO) {
          // afina o instante: primeiro ponto do bloco que passou de 60% do pico
          let iOnset = iPico;
          for (let i = 0; i <= iPico; i++) {
            if (Math.abs(buf[i]) > pico * 0.6) { iOnset = i; break; }
          }
          const t = tempoInicio + (amostrasProcessadas + iOnset) / sr;
          ultimoOnset = t;
          onsets.push(t);
          if (aoDetectar) aoDetectar(t, onsets.length);
        } else {
          // atualiza o ruído de fundo só quando NÃO houve golpe
          fundo = fundo * 0.97 + pico * 0.03;
        }
        amostrasProcessadas += buf.length;
      };

      fonte.connect(filtro);
      filtro.connect(processador);
      processador.connect(mudo);
      mudo.connect(ctx.destination);
      ligado = true;
      return true;
    }

    function desligar() {
      if (processador) { processador.onaudioprocess = null; try { processador.disconnect(); } catch (e) {} }
      if (filtro) { try { filtro.disconnect(); } catch (e) {} }
      if (fonte) { try { fonte.disconnect(); } catch (e) {} }
      if (mudo) { try { mudo.disconnect(); } catch (e) {} }
      if (fluxo) fluxo.getTracks().forEach(function (t) { t.stop(); });
      fluxo = fonte = processador = filtro = mudo = null;
      ligado = false;
      aoDetectar = null;
    }

    function zerar() { onsets = []; }
    function lerOnsets() { return onsets.slice(); }
    function estaLigado() { return ligado; }

    return {
      suportado: suportado, origemSegura: origemSegura,
      ligar: ligar, desligar: desligar, zerar: zerar,
      onsets: lerOnsets, ligado: estaLigado
    };
  })();

  /* ================== AVALIAÇÃO POR MIDI (TRIGGERS USB) ==================
     Objetivo: suportar pads/trigger via MIDI (qualquer controlador compatível
     com OTG/USB Host no Android).
     Assumimos que o dispositivo envia Note On com velocity > 0 para cada golpe.
     Web MIDI costuma exigir contexto seguro (https/localhost) e gesto do usuário.
     ===================================================================== */
  const midi = (function () {
    let acesso = null, ligado = false;
    let inputs = [];
    let onsets = [];
    let aoDetectar = null;
    let ultimoEventoT = -Infinity;

    const REFRATARIO_MS = 45; // evita contar o mesmo golpe duas vezes
    const VELOCIDADE_PISO = 1; // velocity 0 já vira Note Off em geral

    function suportado() {
      return !!(navigator.requestMIDIAccess);
    }

    function origemSegura() {
      return window.isSecureContext === true ||
             location.protocol === 'https:' ||
             location.hostname === 'localhost' ||
             location.hostname === '127.0.0.1';
    }

    async function ligar(callback) {
      if (ligado) return true;
      if (!suportado()) throw new Error('Este navegador não oferece acesso ao MIDI (Web MIDI).');
      if (!origemSegura()) throw new Error('O navegador só libera o MIDI em endereço seguro (https) ou em localhost.');
      if (!Motor || !Motor.contexto) throw new Error('Motor indisponível para alinhamento de tempo.');

      aoDetectar = callback || null;
      onsets = [];
      ultimoEventoT = -Infinity;

      acesso = await navigator.requestMIDIAccess({ sysex: false });
      // inputs no Web MIDI podem mudar; manter uma lista simples.
      inputs = [];
      acesso.inputs.forEach(function (inpt) { inputs.push(inpt); });

      if (!inputs.length) throw new Error('Nenhuma entrada MIDI foi encontrada.');

      inputs.forEach(function (inpt) {
        inpt.onmidimessage = function (ev) {
          if (!ligado) return;
          const data = ev.data;
          // MIDI bytes: [status, d1, d2]
          const status = data[0];
          const tipo = status & 0xf0;
          const d1 = data[1];
          const d2 = data[2];

          // Note On: 0x9n com velocity > 0
          if (tipo === 0x90 && d2 >= VELOCIDADE_PISO) {
            // Alinha no relógio do áudio.
            const ctx = Motor.contexto();
            const agoraT = ctx.currentTime; // segundos
            const deltaMs = (agoraT - ultimoEventoT) * 1000;
            if (agoraT > 0 && deltaMs < REFRATARIO_MS) return;
            ultimoEventoT = agoraT;

            onsets.push(agoraT);
            if (aoDetectar) aoDetectar(agoraT, onsets.length);
          }
        };
      });

      ligado = true;
      return true;
    }

    function desligar() {
      if (!ligado) return;
      inputs.forEach(function (inpt) {
        try { inpt.onmidimessage = null; } catch (e) {}
      });
      inputs = [];
      acesso = null;
      aoDetectar = null;
      ligado = false;
    }

    function zerar() { onsets = []; }
    function lerOnsets() { return onsets.slice(); }
    function estaLigado() { return ligado; }

    return {
      suportado: suportado,
      origemSegura: origemSegura,
      ligar: ligar,
      desligar: desligar,
      zerar: zerar,
      onsets: lerOnsets,
      ligado: estaLigado
    };
  })();

  /* ================== CALIBRAÇÃO DA LATÊNCIA ================== */
  /* O aluno bate 8 vezes junto com o clique. A diferença média entre o
     que ouvimos e o que agendamos é a latência do aparelho + a mão do
     aluno. Usamos a MEDIANA para um golpe torto não estragar a conta. */
  function calcularLatencia(onsets, alvos) {
    if (!onsets.length || !alvos.length) return null;
    const difs = [];
    onsets.forEach(function (o) {
      let melhorD = Infinity;
      alvos.forEach(function (a) {
        const d = o - a;
        if (Math.abs(d) < Math.abs(melhorD)) melhorD = d;
      });
      if (Math.abs(melhorD) < 0.25) difs.push(melhorD * 1000);
    });
    if (difs.length < 3) return null;
    difs.sort(function (a, b) { return a - b; });
    const meio = Math.floor(difs.length / 2);
    const mediana = difs.length % 2 ? difs[meio] : (difs[meio - 1] + difs[meio]) / 2;
    return { latenciaMs: Math.round(mediana * 10) / 10, amostras: difs.length };
  }

  return {
    calcular: calcular,
    diagnostico: diagnostico,
    microfone: microfone,
    midi: midi,
    calcularLatencia: calcularLatencia
  };
})();
