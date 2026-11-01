const DEFAULT_CONFIG = {
  nome: "BarberBook",
  slogan: "Estilo e precisão em cada corte",
  telefone: "(18) 99999-9999",
  whatsapp: "5518999999999",
  endereco: "Rua Exemplo, 123 - Araçatuba - SP",
  horarios: "Segunda a sábado, das 09:00 às 19:00",
  instagram: "",
  facebook: "",
  foto_url: "",
  lat: "-21.2089",
  lng: "-50.4328"
};

let CONFIG_CACHE = { ...DEFAULT_CONFIG };

// Devolve as configurações já carregadas (use depois de configPronta)
function getConfig() {
  return { ...CONFIG_CACHE };
}

// Busca no servidor; se falhar, o site continua com os valores padrão
const configPronta = fetch("/api/config")
  .then(r => (r.ok ? r.json() : {}))
  .catch(() => ({}))
  .then(dados => {
    CONFIG_CACHE = { ...DEFAULT_CONFIG, ...dados };
    return getConfig();
  });

function digits(v) {
  return String(v || "").replace(/\D/g, "");
}

function aplicarMarca(nome) {
  const texto = String(nome || "").trim() || DEFAULT_CONFIG.nome;

  let destaque, resto;
  const m = texto.match(/^(.+?)(book)$/i);
  if (m) {
    destaque = m[1];
    resto = m[2];
  } else {
    
    const palavras = texto.split(/\s+/);
    destaque = palavras[0];
    resto = palavras.length > 1 ? " " + palavras.slice(1).join(" ") : "";
  }

  document.querySelectorAll(".brand strong").forEach(el => {
    el.replaceChildren();
    const span = document.createElement("span");
    span.textContent = destaque;
    el.append(span, resto);
  });

  document.querySelectorAll("footer strong").forEach(el => {
    el.textContent = texto;
  });

  document.title = texto;
}

function bindConfig() {
  const c = getConfig();
  aplicarMarca(c.nome);
  document.querySelectorAll("[data-config]").forEach(el => {
    const k = el.dataset.config;
    if (k in c) el.textContent = c[k];
  });
  document.querySelectorAll("[data-action]").forEach(btn => {
    btn.onclick = () => {
      const a = btn.dataset.action;
      if (a === "telefone" && c.telefone) location.href = "tel:" + digits(c.telefone);
      if (a === "whatsapp" && c.whatsapp) window.open("https://wa.me/" + digits(c.whatsapp), "_blank");
      if (a === "rota" && c.endereco) window.open("https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(c.endereco), "_blank");
      if (a === "instagram" && c.instagram) window.open(c.instagram, "_blank");
      if (a === "facebook" && c.facebook) window.open(c.facebook, "_blank");
    };
  });
}

document.addEventListener("DOMContentLoaded", () => configPronta.then(bindConfig));