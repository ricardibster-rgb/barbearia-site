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
function getConfig(){ try { return {...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem("barberbook_config") || "{}")} } catch(e){ return {...DEFAULT_CONFIG}; } }
function saveConfig(config){ localStorage.setItem("barberbook_config", JSON.stringify({...DEFAULT_CONFIG, ...config})); }
function digits(v){ return String(v || "").replace(/\D/g, ""); }
function bindConfig(){ const c=getConfig(); document.querySelectorAll("[data-config]").forEach(el=>{const k=el.dataset.config; if(k in c) el.textContent=c[k];}); document.querySelectorAll("[data-action]").forEach(btn=>{btn.onclick=()=>{const a=btn.dataset.action; if(a==="telefone"&&c.telefone) location.href="tel:"+digits(c.telefone); if(a==="whatsapp"&&c.whatsapp) window.open("https://wa.me/"+digits(c.whatsapp),"_blank"); if(a==="rota"&&c.endereco) window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(c.endereco),"_blank"); if(a==="instagram"&&c.instagram) window.open(c.instagram,"_blank"); if(a==="facebook"&&c.facebook) window.open(c.facebook,"_blank");};});}
document.addEventListener("DOMContentLoaded", bindConfig);