// IMPORTS ESSENCIAIS
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// LOGS E DEBUG
console.log("🚀 Iniciando bot...");

process.on('unhandledRejection', (err) => {
    console.error('❌ ERRO NÃO TRATADO:', err);
});

process.on('uncaughtException', (err) => {
    console.error('❌ EXCEPTION:', err);
});

// CLIENT CONFIGURADO PARA CHROMIUM DO CONTAINER
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: "bot",
        dataPath: "/app/session"
    }),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        userDataDir: '/app/session/chrome', // 👈 ESSA LINHA RESOLVE
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// ======================= QR =======================
client.on('qr', qr => {
    console.log('Escaneie o QR abaixo:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('✅ Autenticado!'));
client.on('auth_failure', () => console.log('❌ Falha na autenticação!'));

// ======================= READY =======================
client.on('ready', () => {
    console.log('🤖 Bot pronto!');
});

// INICIALIZA O CLIENT
client.initialize();

// ======================= DADOS =======================
const pizzas = [
    "Calabresa", "Frango Catupiry", "Quatro Queijos", 
    "Portuguesa", "Mussarela", "Pepperoni"
];

const indisponiveis = ["Portuguesa", "Pepperoni"];

const precos = {
    "Calabresa": { P:25, M:35, G:45, F:55 },
    "Frango Catupiry": { P:28, M:38, G:48, F:58 },
    "Quatro Queijos": { P:30, M:40, G:50, F:60 },
    "Mussarela": { P:22, M:32, G:42, F:50 },
    "Portuguesa": { P:27, M:37, G:47, F:57 },
    "Pepperoni": { P:29, M:39, G:49, F:59 }
};

const bebidas = {
    "coca lata":6, "coca cola lata":6,
    "coca 1l":9, "coca cola 1l":9,
    "coca 2l":12, "coca cola 2l":12,
    "guarana lata":5, "agua":3
};

const aliasBebidas = {
    "coca lata":"Coca-Cola Lata", "coca cola lata":"Coca-Cola Lata",
    "coca 1l":"Coca-Cola 1L", "coca cola 1l":"Coca-Cola 1L",
    "coca 2l":"Coca-Cola 2L", "coca cola 2l":"Coca-Cola 2L",
    "guarana lata":"Guaraná Lata", "agua":"Água"
};

const tamanhos = { p:"P", m:"M", g:"G", f:"F" };
const numeros = { um:1, uma:1, dois:2, duas:2, tres:3, quatro:4 };
const SIM = ["sim","s","confirmar","ok","1"];
const NAO = ["nao","não","n","cancelar","2"];

// ======================= ESTADOS =======================
let estados = {};
let carrinhoPizza = {};
let carrinhoBebida = {};
let pendentePizza = {};
let pendenteBebida = {};
let enderecoTemp = {};

// ======================= UTIL =======================
const normalize = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

async function responder(to, texto){
    await client.sendMessage(to,"⏳ PROCESSANDO...");
    setTimeout(()=>{
        client.sendMessage(to, texto);
    },500);
}

function resetUser(user){
    estados[user] = "menu";
    carrinhoPizza[user] = [];
    carrinhoBebida[user] = [];
    pendentePizza[user] = [];
    pendenteBebida[user] = [];
}

// ======================= BOT =======================
client.on("message", async (msg) => {
    if (msg.fromMe) return;

    const from = msg.from;
    const texto = msg.body || "";
    const text = normalize(texto);

    estados[from] ??= "menu";
    carrinhoPizza[from] ??= [];
    carrinhoBebida[from] ??= [];

    function corrigirSabor(txt){
        for(let p of pizzas){
            if(normalize(p) === txt) return p;
        }
        return null;
    }

    function extrairPizzas(texto){
        texto = normalize(texto).replace(/,/g," e ");
        const partes = texto.split(" e ");
        let itens = [];
        let erros = [];

        partes.forEach((parte,i)=>{
            let palavras = parte.trim().split(" ");
            let qtd = null;
            let tamanho = null;

            if(!isNaN(palavras[0])) qtd = parseInt(palavras.shift());
            else if(numeros[palavras[0]]) qtd = numeros[palavras.shift()];

            palavras = palavras.filter(p=>{
                if(tamanhos[p]){
                    tamanho = tamanhos[p];
                    return false;
                }
                return true;
            });

            const sabor = corrigirSabor(palavras.join(" "));

            if(!qtd) erros.push(`Item ${i+1}: FALTOU QUANTIDADE`);
            if(!tamanho) erros.push(`Item ${i+1}: FALTOU TAMANHO`);
            if(!sabor) erros.push(`Item ${i+1}: SABOR NÃO RECONHECIDO`);
            if(indisponiveis.includes(sabor)) erros.push(`Item ${i+1}: ${sabor.toUpperCase()} INDISPONÍVEL`);

            if(qtd && tamanho && sabor && !indisponiveis.includes(sabor)){
                itens.push({ sabor, qtd, tamanho });
            }
        });

        if(erros.length) return { erro:true, erros };
        return itens;
    }

    function extrairBebidas(texto){
        texto = normalize(texto).replace(/,/g," e ");
        const partes = texto.split(" e ");
        let itens = [];

        for(let parte of partes){
            let qtd = 1;
            const num = parte.match(/\d+/);
            if(num) qtd = parseInt(num[0]);

            for(let b in bebidas){
                if(parte.includes(b)){
                    itens.push({ nome: aliasBebidas[b], qtd, preco: bebidas[b] });
                    break;
                }
            }
        }

        return itens.length ? itens : null;
    }

    // ======================= FLUXO =======================
    if (["oi","ola","menu"].includes(text)) {
        resetUser(from);
        return responder(from,"🍕 Bem-vindo!\n\n1️⃣ Ver cardápio");
    }

    if (text === "1" && estados[from] === "menu") {
        estados[from] = "pizzas";
        return responder(from,"Digite seu pedido de pizza 🍕");
    }

    if (estados[from] === "pizzas") {
        const res = extrairPizzas(text);

        if (res.erro)
            return responder(from, "❌ Erro:\n" + res.erros.join("\n"));

        pendentePizza[from] = res;

        let r = "CONFIRME:\n\n";
        let total = 0;

        res.forEach(i=>{
            const v = i.qtd * precos[i.sabor][i.tamanho];
            total += v;
            r += `${i.qtd}x ${i.sabor} (${i.tamanho}) — R$ ${v}\n`;
        });

        r += `\nTOTAL: R$ ${total}\n1 confirmar\n2 cancelar`;

        estados[from] = "confirma_pizza";
        return responder(from, r);
    }

    if (estados[from] === "confirma_pizza") {
        if (SIM.includes(text)) {
            carrinhoPizza[from].push(...pendentePizza[from]);
            estados[from] = "final";
            return responder(from,"Digite seu endereço 📍");
        } else {
            estados[from] = "pizzas";
            return responder(from,"Envie novamente.");
        }
    }

    if (estados[from] === "final") {
        enderecoTemp[from] = texto;
        estados[from] = "fim";

        return responder(from,"✅ Pedido confirmado!\n🍕 Chega em 40 min");
    }
});

// ======================= INICIAR BOT =======================
client.initialize();